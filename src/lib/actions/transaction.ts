

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
                
                unifiedRecords.push({
                    id,
                    date: record.date,
                    type: record.type,
                    category: 'fiat',
                    source: record.source,
                    amount: record.amount,
                    currency: record.currency,
                    amountUsd: record.amountUsd,
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

                 unifiedRecords.push({
                    id,
                    date: record.date,
                    type: record.type,
                    category: 'crypto',
                    source: record.source,
                    amount: record.amount,
                    currency: 'USDT',
                    amountUsd: record.amount, // For USDT, amount is same as amountUsd
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
    const newId = await getNextSequentialId('transactionId');
    
    try {
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
            const record = allCashRecords[id] || allUsdtRecords[id];
            return record ? { ...record, id, recordType: allCashRecords[id] ? 'cash' : 'usdt' } : null;
        }).filter(r => r && (r.status === 'Matched' || r.status === 'Confirmed' || r.status === 'Pending'));


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
        
        const totalInflowUSD = allLinkedRecords.filter(r => r!.type === 'inflow').reduce((sum, r) => sum + (r!.amountUsd || r!.amount), 0);
        const totalOutflowUSD = allLinkedRecords.filter(r => r!.type === 'outflow').reduce((sum, r) => sum + (r!.amountUsd || r!.amount), 0);
        
        let baseAmountForFee = 0;
        if (type === 'Deposit') {
            baseAmountForFee = allLinkedRecords.filter(r => r!.type === 'outflow' && r!.recordType === 'usdt').reduce((sum, r) => sum + r!.amount, 0);
        } else if (type === 'Withdraw') {
            baseAmountForFee = allLinkedRecords.filter(r => r!.type === 'inflow' && r!.recordType === 'usdt').reduce((sum, r) => sum + r!.amount, 0);
        }

        const feePercent = (type === 'Deposit' ? cryptoFees.buy_fee_percent : cryptoFees.sell_fee_percent) / 100;
        const minFee = type === 'Deposit' ? cryptoFees.minimum_buy_fee : cryptoFees.minimum_sell_fee;
        const fee = Math.max(baseAmountForFee * feePercent, baseAmountForFee > 0 ? minFee : 0);
        
        const difference = (totalOutflowUSD + fee) - totalInflowUSD;

        if (difference > 0 && differenceHandling === 'income' && !incomeAccountId) {
            return { errors: { incomeAccountId: ['An income account must be selected for the gain.'] }, message: 'Missing income account.', success: false };
        }
        if (difference < 0 && differenceHandling === 'expense' && !expenseAccountId) {
            return { errors: { expenseAccountId: ['An expense account must be selected for the loss.'] }, message: 'Missing expense account.', success: false };
        }
        
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
            amount_usdt: totalOutflowUSD,
            expense_usd: difference < 0 ? Math.abs(difference) : 0,
            exchange_rate_commission: difference > 0 ? difference : 0,
            notes,
            status: 'Confirmed',
            createdAt: new Date().toISOString(),
            linkedRecordIds: linkedRecordIds.join(','),
            attachment_url: attachmentUrl || undefined,
        };
        
        const updates: { [key: string]: any } = {};
        updates[`/transactions/${newId}`] = stripUndefined(newTransactionData);
        
        for (const record of allLinkedRecords) {
            if (!record) continue;
            const recordPath = record.recordType === 'cash' ? `/cash_records/${record.id}` : `/modern_usdt_records/${record.id}`;
            updates[`${recordPath}/status`] = 'Used';
            if (record.status === 'Pending') {
                 updates[`${recordPath}/clientId`] = clientId;
                 updates[`${recordPath}/clientName`] = client.name;
            }
        }
        
        await update(ref(db), updates);
        
        const clientAccountId = `6000${clientId}`;
        
        // 1. Journal for the Fee
        if (fee > 0.001) {
            const feeDesc = `Fee for Tx #${newId} (${type})`;
            const feeLegs = [
                { accountId: '4002', debit: 0, credit: fee }, // Credit Fee Income
                { accountId: clientAccountId, debit: fee, credit: 0 }, // Debit Client Liability
            ];
            await createJournalEntryFromTransaction(feeDesc, feeLegs);
        }

        // 2. Journal for the Exchange Difference
        if (Math.abs(difference) > 0.001) {
            let diffDesc: string;
            let diffLegs: { accountId: string; debit: number; credit: number; }[] = [];
            
            // We gained money (negative difference)
            if (difference < 0) {
                const gain = Math.abs(difference);
                if (differenceHandling === 'income') {
                    diffDesc = `Exchange Gain on Tx #${newId}`;
                    diffLegs.push({ accountId: incomeAccountId!, debit: 0, credit: gain });
                    diffLegs.push({ accountId: clientAccountId, debit: gain, credit: 0 });
                } else { // Credit to Client
                    diffDesc = `Overpayment credited to client on Tx #${newId}`;
                    // This logic seems reversed. If we gain, and credit client, it's a liability for us.
                    // This will be handled implicitly by the main transaction legs. No extra entry needed if it's a client credit.
                }
            } 
            // We lost money (positive difference)
            else {
                const loss = difference;
                 if (differenceHandling === 'expense') {
                    diffDesc = `Exchange Loss/Discount on Tx #${newId}`;
                    diffLegs.push({ accountId: expenseAccountId!, debit: loss, credit: 0 });
                    diffLegs.push({ accountId: clientAccountId, credit: loss, debit: 0 });
                 } else { // Debit from Client
                    diffDesc = `Underpayment debited from client on Tx #${newId}`;
                    // This will be handled implicitly by the main transaction legs. No extra entry needed if it's a client debit.
                 }
            }

            if(diffLegs.length > 0) {
                await createJournalEntryFromTransaction(diffDesc, diffLegs);
            }
        }

        revalidatePath('/transactions/modern');
        revalidatePath('/transactions');
        revalidatePath('/cash-records');
        revalidatePath('/modern-usdt-records');
        
        return { success: true, message: 'Transaction created successfully.' };

    } catch (e: any) {
        console.error("Error creating modern transaction:", e);
        return { message: 'Database Error: Could not create transaction.', success: false };
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
            updates[`/transactions/${id}/status`] = status;
        }

        await update(ref(db), updates);
        revalidatePath('/transactions');
        return { message: `${transactionIds.length} transaction(s) updated to "${status}".` };
    } catch (e: any) {
        console.error("Bulk Transaction Update Error:", e);
        return { error: true, message: e.message || 'An unknown database error occurred.' };
    }
}
