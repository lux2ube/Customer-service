

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, limitToLast, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Transaction, CryptoFee, ServiceProvider, ClientServiceProvider, CashRecord, UsdtRecord, UnifiedFinancialRecord } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction, getNextSequentialId } from './helpers';
import { createJournalEntryFromTransaction } from './journal';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';
import { normalizeArabic } from '../utils';

export async function getUnifiedClientRecords(clientId: string): Promise<UnifiedFinancialRecord[]> {
    if (!clientId) return [];

    try {
        const cashRecordsQuery = query(ref(db, 'cash_records'), orderByChild('clientId'), equalTo(clientId));
        const usdtRecordsQuery = query(ref(db, 'modern_usdt_records'), orderByChild('clientId'), equalTo(clientId));

        const [
            cashRecordsSnapshot,
            usdtRecordsSnapshot
        ] = await Promise.all([
            get(cashRecordsQuery),
            get(usdtRecordsQuery),
        ]);

        const unifiedRecords: UnifiedFinancialRecord[] = [];

        // --- Process Cash Records ---
        if (cashRecordsSnapshot.exists()) {
            const allCashRecords: Record<string, CashRecord> = cashRecordsSnapshot.val();
            for (const id in allCashRecords) {
                const record = allCashRecords[id];
                if (record.status === 'Used' || record.status === 'Cancelled') continue;
                if (record.status !== 'Matched' && record.status !== 'Pending' && record.status !== 'Confirmed') continue;
                
                unifiedRecords.push({
                    id,
                    date: record.date,
                    type: record.type,
                    category: 'fiat',
                    source: record.source,
                    amount: record.amount,
                    currency: record.currency,
                    amount_usd: record.amountusd,
                    status: record.status,
                    bankAccountName: record.accountName,
                    senderName: record.senderName,
                    recipientName: record.recipientName,
                });
            }
        }
        
        // --- Process USDT Records ---
        if (usdtRecordsSnapshot.exists()) {
            const allUsdtRecords: Record<string, UsdtRecord> = usdtRecordsSnapshot.val();
            for (const id in allUsdtRecords) {
                const record = allUsdtRecords[id];
                if (record.status === 'Used' || record.status === 'Cancelled') continue;
                if (record.status !== 'Matched' && record.status !== 'Pending' && record.status !== 'Confirmed') continue;

                 unifiedRecords.push({
                    id,
                    date: record.date,
                    type: record.type,
                    category: 'crypto',
                    source: record.source,
                    amount: record.amount,
                    currency: 'USDT',
                    amount_usd: record.amount, // For USDT, amount is same as amount_usd
                    status: record.status,
                    cryptoWalletName: record.accountName,
                    txHash: record.txHash,
                    clientWalletAddress: record.clientWalletAddress,
                });
            }
        }

        unifiedRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return unifiedRecords;

    } catch (error) {
        console.error("Error fetching unified client records:", error);
        return [];
    }
}


export type TransactionFormState =
  | {
      errors?: {
        clientId?: string[];
        type?: string[];
        linkedRecordIds?: string[];
        incomeAccountId?: string[];
        expenseAccountId?: string[];
      };
      message?: string;
      success?: boolean;
      transactionId?: string;
    }
  | undefined;

const ModernTransactionSchema = z.object({
    clientId: z.string().min(1, 'A client must be selected.'),
    type: z.enum(['Deposit', 'Withdraw', 'Transfer']),
    linkedRecordIds: z.array(z.string()).min(1, { message: 'At least one financial record must be linked.' }),
    notes: z.string().optional(),
    attachment: z.instanceof(File).optional(),
    differenceHandling: z.enum(['credit', 'income', 'debit', 'expense']).optional(),
    incomeAccountId: z.string().optional(),
    expenseAccountId: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.differenceHandling === 'income' && !data.incomeAccountId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['incomeAccountId'],
            message: 'An income account must be selected to record a gain.',
        });
    }
    if (data.differenceHandling === 'expense' && !data.expenseAccountId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['expenseAccountId'],
            message: 'An expense account must be selected to record a loss.',
        });
    }
});

export async function createModernTransaction(prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
    const validatedFields = ModernTransactionSchema.safeParse({
        clientId: formData.get('clientId'),
        type: formData.get('type'),
        linkedRecordIds: formData.getAll('linkedRecordIds'),
        notes: formData.get('notes'),
        attachment: formData.get('attachment'),
        differenceHandling: formData.get('differenceHandling'),
        incomeAccountId: formData.get('incomeAccountId'),
        expenseAccountId: formData.get('expenseAccountId'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    const { clientId, type, linkedRecordIds, notes, attachment, differenceHandling, incomeAccountId, expenseAccountId } = validatedFields.data;
    
    try {
        const newId = await getNextSequentialId('transactionId');
        const [clientSnapshot, cashRecordsSnapshot, usdtRecordsSnapshot, cryptoFeesSnapshot] = await Promise.all([
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, 'cash_records')),
            get(ref(db, 'modern_usdt_records')),
            get(query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1))),
        ]);

        if (!clientSnapshot.exists()) {
            return { message: 'Client not found.', success: false };
        }
        const client = clientSnapshot.val() as Client;

        const allCashRecords = cashRecordsSnapshot.val() || {};
        const allUsdtRecords = usdtRecordsSnapshot.val() || {};
        
        const allLinkedRecords = linkedRecordIds.map(id => {
            if (allCashRecords[id]) {
                return { ...allCashRecords[id], id, recordType: 'cash', amount_usd: allCashRecords[id].amountusd };
            }
            if (allUsdtRecords[id]) {
                return { ...allUsdtRecords[id], id, recordType: 'usdt', amount_usd: allUsdtRecords[id].amount };
            }
            return null;
        }).filter((r): r is (CashRecord & {id: string, recordType: 'cash', amount_usd: number}) | (UsdtRecord & {id: string, recordType: 'usdt', amount_usd: number}) => r !== null && (r.status === 'Matched' || r.status === 'Confirmed' || r.status === 'Pending'));


        if (allLinkedRecords.length !== linkedRecordIds.length) {
            return { message: 'One or more linked records were not found or are not in a linkable state.', success: false };
        }
        
        let cryptoFees: CryptoFee | null = null;
        if (cryptoFeesSnapshot.exists()) {
            const data = cryptoFeesSnapshot.val();
            const lastEntryKey = Object.keys(data)[0];
            cryptoFees = data[lastEntryKey];
        } else {
            return { message: 'Crypto fees are not configured in settings.', success: false };
        }
        
        const totalInflowUSD = allLinkedRecords.filter(r => r.type === 'inflow').reduce((sum, r) => sum + r.amount_usd, 0);
        const totalOutflowUSD = allLinkedRecords.filter(r => r.type === 'outflow').reduce((sum, r) => sum + r.amount_usd, 0);
        
        let fee = 0;
        let baseAmountForFee = 0;

        if (type === 'Deposit') {
            // Fee is based on USDT OUTFLOW. USDT Outflow is what the client gets.
            baseAmountForFee = allLinkedRecords.filter(r => r.type === 'outflow' && r.recordType === 'usdt').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.buy_fee_percent || 0) / 100;
            const minFee = cryptoFees.minimum_buy_fee || 0;
            fee = Math.max(baseAmountForFee * feePercent, baseAmountForFee > 0 ? minFee : 0);
        } else if (type === 'Withdraw') {
            // Fee is based on USDT INFLOW.
            baseAmountForFee = allLinkedRecords.filter(r => r.type === 'inflow' && r.recordType === 'usdt').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.sell_fee_percent || 0) / 100;
            const minFee = cryptoFees.minimum_sell_fee || 0;
            fee = Math.max(baseAmountForFee * feePercent, minFee);
        } else if (type === 'Transfer') {
             // For transfers, fee is on any USDT movement. We will assume a 'sell' fee for now.
             baseAmountForFee = allLinkedRecords.filter(r => r.recordType === 'usdt').reduce((sum, r) => sum + r.amount, 0);
             const feePercent = (cryptoFees.sell_fee_percent || 0) / 100;
             const minFee = cryptoFees.minimum_sell_fee || 0;
             fee = Math.max(baseAmountForFee * feePercent, minFee);
        }
        
        const difference = (totalOutflowUSD + fee) - totalInflowUSD;
        
        let attachmentUrl = '';
        if (attachment && attachment.size > 0) {
             const fileRef = storageRef(storage, `transaction_attachments/${newId}/${attachment.name}`);
             await uploadBytes(fileRef, attachment);
             attachmentUrl = await getDownloadURL(fileRef);
        }

        const newTransactionData: Partial<Transaction> = {
            id: newId,
            date: new Date().toISOString(),
            type,
            clientId,
            clientName: client.name,
            amount_usd: totalInflowUSD,
            fee_usd: fee,
            outflow_usd: totalOutflowUSD,
            expense_usd: difference > 0.01 ? difference : 0,
            exchange_rate_commission: difference < -0.01 ? Math.abs(difference) : 0,
            notes,
            status: 'Confirmed',
            createdAt: new Date().toISOString(),
            linkedRecordIds: linkedRecordIds.join(','),
            attachment_url: attachmentUrl || undefined,
        };
        
        const updates: { [key: string]: any } = {};
        updates[`/modern_transactions/${newId}`] = stripUndefined(newTransactionData);
        
        for (const record of allLinkedRecords) {
            const recordPath = record.recordType === 'cash' ? `/cash_records/${record.id}` : `/modern_usdt_records/${record.id}`;
            updates[`${recordPath}/status`] = 'Used';
            if (record.status === 'Pending') {
                 updates[`${recordPath}/clientId`] = clientId;
                 updates[`${recordPath}/clientName`] = client.name;
            }
        }
        
        await update(ref(db), updates);
        
        const clientAccountId = `6000${clientId}`;
        
        if (Object.keys(updates).length > 0) {
            await createJournalEntriesForTransaction(newId, client.name, clientAccountId, allLinkedRecords, fee, difference, differenceHandling, incomeAccountId, expenseAccountId);
        }

        revalidatePath('/transactions/modern');
        revalidatePath('/transactions');
        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');
        
        return { success: true, message: 'Transaction created successfully.' };

    } catch (e: any) {
        console.error("Error creating modern transaction:", e);
        return { message: 'Database Error: Could not create transaction.', success: false };
    }
}


async function createJournalEntriesForTransaction(
    txId: string, clientName: string, clientAccountId: string, 
    linkedRecords: (CashRecord | UsdtRecord)[], fee: number, difference: number,
    differenceHandling?: string, incomeAccountId?: string, expenseAccountId?: string
) {
    const description = `Tx #${txId} for ${clientName}`;
    
    for (const record of linkedRecords) {
        const recordDesc = `${description} | Ref: ${record.id}`;
        const amount = (record as any).amount_usd || (record as any).amount;
        if (record.type === 'inflow') {
            await createJournalEntryFromTransaction(recordDesc, [
                { accountId: record.accountId, debit: amount, credit: 0 },
                { accountId: clientAccountId, debit: 0, credit: amount }
            ]);
        } else { // outflow
             await createJournalEntryFromTransaction(recordDesc, [
                { accountId: record.accountId, debit: 0, credit: amount },
                { accountId: clientAccountId, debit: amount, credit: 0 }
            ]);
        }
    }

    if (fee > 0.001) {
        await createJournalEntryFromTransaction(`Fee for Tx #${txId}`, [
            { accountId: '4002', debit: 0, credit: fee },
            { accountId: clientAccountId, debit: fee, credit: 0 },
        ]);
    }

    if (Math.abs(difference) > 0.01) {
        if (difference < 0) { // Gain
            if (differenceHandling === 'income' && incomeAccountId) {
                await createJournalEntryFromTransaction(`Gain on Tx #${txId}`, [
                    { accountId: incomeAccountId, debit: 0, credit: Math.abs(difference) },
                    { accountId: clientAccountId, debit: Math.abs(difference), credit: 0 }
                ]);
            }
        } else { // Loss
            if (differenceHandling === 'expense' && expenseAccountId) {
                await createJournalEntryFromTransaction(`Loss on Tx #${txId}`, [
                    { accountId: expenseAccountId, debit: difference, credit: 0 },
                    { accountId: clientAccountId, debit: 0, credit: difference }
                ]);
            }
        }
    }
}


export type BulkUpdateState = { message?: string; error?: boolean; } | undefined;

export async function updateBulkTransactions(prevState: BulkUpdateState, formData: FormData): Promise<BulkUpdateState> {
    const transactionIds = formData.getAll('transactionIds') as string[];
    const status = formData.get('status') as string;

    if (!transactionIds || transactionIds.length === 0 || !status) {
        return { error: true, message: 'No records or status provided for bulk update.' };
    }

    try {
        const updates: { [key: string]: any } = {};
        for (const id of transactionIds) {
            updates[`/modern_transactions/${id}/status`] = status;
        }

        await update(ref(db), updates);
        revalidatePath('/transactions');
        return { message: `${transactionIds.length} transaction(s) updated to "${status}".` };
    } catch (e: any) {
        console.error("Bulk Transaction Update Error:", e);
        return { error: true, message: e.message || 'An unknown database error occurred.' };
    }
}

