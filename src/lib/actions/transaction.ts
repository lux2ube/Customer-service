

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, limitToLast, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Transaction, CryptoFee, ServiceProvider, ClientServiceProvider, CashRecord, UsdtRecord, UnifiedFinancialRecord, TransactionLeg } from '../types';
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
                    amount_usd: record.amount,
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
      };
      message?: string;
      success?: boolean;
      transactionId?: string;
    }
  | undefined;

const ModernTransactionSchema = z.object({
    clientId: z.string().min(1, 'A client must be selected.'),
    type: z.enum(['Deposit', 'Withdraw', 'Transfer']),
    linkedRecordIds: z.preprocess((val) => (Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean)), z.array(z.string()).min(1, { message: 'At least one financial record must be linked.' })),
    notes: z.string().optional(),
    attachment: z.instanceof(File).optional(),
    differenceHandling: z.enum(['income', 'expense', 'client_liability']).optional(),
    incomeAccountId: z.string().optional(),
    expenseAccountId: z.string().optional(),
});


export async function createModernTransaction(prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
    const validatedFields = ModernTransactionSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    const { clientId, type, linkedRecordIds, notes, attachment, differenceHandling, incomeAccountId, expenseAccountId } = validatedFields.data;
    
    try {
        const [clientSnapshot, cashRecordsSnapshot, usdtRecordsSnapshot, cryptoFeesSnapshot] = await Promise.all([
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, 'cash_records')),
            get(ref(db, 'modern_usdt_records')),
            get(query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1))),
        ]);

        if (!clientSnapshot.exists()) return { message: 'Client not found.', success: false };
        const client = clientSnapshot.val() as Client;
        const allCashRecords = cashRecordsSnapshot.val() || {};
        const allUsdtRecords = usdtRecordsSnapshot.val() || {};
        const lastFeeEntry = cryptoFeesSnapshot.exists() ? Object.values(cryptoFeesSnapshot.val())[0] as CryptoFee : null;

        const allLinkedRecords = linkedRecordIds.map(id => {
            if (allCashRecords[id]) return { ...allCashRecords[id], id, recordType: 'cash', amount_usd: allCashRecords[id].amountusd };
            if (allUsdtRecords[id]) return { ...allUsdtRecords[id], id, recordType: 'usdt', amount_usd: allUsdtRecords[id].amount };
            return null;
        }).filter((r): r is CashRecord | UsdtRecord => r !== null);


        const inflows: TransactionLeg[] = allLinkedRecords
            .filter(r => r.type === 'inflow')
            .map(r => ({
                recordId: r.id,
                type: r.source === 'Manual' || r.source === 'SMS' ? 'cash' : 'usdt',
                accountId: r.accountId,
                accountName: r.accountName,
                amount: r.amount,
                currency: (r as CashRecord).currency || 'USDT',
                amount_usd: r.source === 'Manual' || r.source === 'SMS' ? (r as CashRecord).amountusd : r.amount,
            }));
            
        const outflows: TransactionLeg[] = allLinkedRecords
            .filter(r => r.type === 'outflow')
            .map(r => ({
                recordId: r.id,
                type: r.source === 'Manual' || r.source === 'SMS' ? 'cash' : 'usdt',
                accountId: r.accountId,
                accountName: r.accountName,
                amount: r.amount,
                currency: (r as CashRecord).currency || 'USDT',
                amount_usd: r.source === 'Manual' || r.source === 'SMS' ? (r as CashRecord).amountusd : r.amount,
            }));

        const totalInflowUSD = inflows.reduce((sum, r) => sum + r.amount_usd, 0);
        const totalOutflowUSD = outflows.reduce((sum, r) => sum + r.amount_usd, 0);
        
        let fee = 0;
        if (lastFeeEntry) {
            if (type === 'Deposit') {
                const usdtOutflow = outflows.filter(r => r.type === 'usdt').reduce((sum, r) => sum + r.amount, 0);
                const feePercent = (lastFeeEntry.buy_fee_percent || 0) / 100;
                fee = Math.max(usdtOutflow * feePercent, usdtOutflow > 0 ? (lastFeeEntry.minimum_buy_fee || 0) : 0);
            } else if (type === 'Withdraw') {
                const usdtInflow = inflows.filter(r => r.type === 'usdt').reduce((sum, r) => sum + r.amount, 0);
                const feePercent = (lastFeeEntry.sell_fee_percent || 0) / 100;
                fee = Math.max(usdtInflow * feePercent, usdtInflow > 0 ? (lastFeeEntry.minimum_sell_fee || 0) : 0);
            }
        }
        
        const netDifference = (totalInflowUSD) - (totalOutflowUSD + fee);

        const newId = await getNextSequentialId('transactionId');
        let attachmentUrl = '';
        if (attachment?.size > 0) {
             const fileRef = storageRef(storage, `transaction_attachments/${newId}/${attachment.name}`);
             await uploadBytes(fileRef, attachment);
             attachmentUrl = await getDownloadURL(fileRef);
        }

        const newTransactionData: Transaction = {
            id: newId,
            date: new Date().toISOString(),
            type,
            clientId,
            clientName: client.name,
            status: 'Pending',
            notes,
            attachment_url: attachmentUrl || undefined,
            createdAt: new Date().toISOString(),
            inflows,
            outflows,
            summary: {
                total_inflow_usd: totalInflowUSD,
                total_outflow_usd: totalOutflowUSD,
                fee_usd: fee,
                net_difference_usd: netDifference
            }
        };
        
        const updates: { [key: string]: any } = {};
        updates[`/modern_transactions/${newId}`] = stripUndefined(newTransactionData);
        
        await update(ref(db), updates);

        revalidatePath('/transactions');
        return { success: true, message: 'Transaction created and is now pending confirmation.' };

    } catch (e: any) {
        console.error("Error creating modern transaction:", e);
        return { message: 'Database Error: Could not create transaction.', success: false };
    }
}

export type ConfirmState = { message?: string; error?: boolean; } | undefined;

export async function confirmTransaction(transactionId: string): Promise<ConfirmState> {
    if (!transactionId) {
        return { error: true, message: "Transaction ID is required." };
    }

    try {
        const txRef = ref(db, `modern_transactions/${transactionId}`);
        const txSnapshot = await get(txRef);
        if (!txSnapshot.exists()) {
            return { error: true, message: "Transaction not found." };
        }

        const transaction = txSnapshot.val() as Transaction;
        if (transaction.status !== 'Pending') {
            return { error: true, message: `Transaction is already ${transaction.status}.` };
        }
        
        const clientSnapshot = await get(ref(db, `clients/${transaction.clientId}`));
        if (!clientSnapshot.exists()) {
             return { error: true, message: "Client associated with transaction not found." };
        }
        const client = clientSnapshot.val() as Client;

        await createJournalEntriesForTransaction(transaction, client);

        const updates: { [key: string]: any } = {};
        updates[`/modern_transactions/${transactionId}/status`] = 'Confirmed';
        
        const allLinkedRecords = [...transaction.inflows, ...transaction.outflows];
        for (const record of allLinkedRecords) {
            const recordPath = record.type === 'cash' ? `/cash_records/${record.recordId}` : `/modern_usdt_records/${record.recordId}`;
            updates[`${recordPath}/status`] = 'Used';
        }

        await update(ref(db), updates);

        revalidatePath('/transactions');
        revalidatePath('/accounting/journal');
        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');

        return { message: `Transaction ${transactionId} has been confirmed and accounted for.` };

    } catch (error: any) {
        console.error("Error confirming transaction:", error);
        return { error: true, message: error.message || "An unknown error occurred." };
    }
}


async function createJournalEntriesForTransaction(transaction: Transaction, client: Client) {
    const description = `Tx #${transaction.id} for ${client.name}`;
    const clientAccountId = `6000${client.id}`;
    
    // Process all inflows
    for (const leg of transaction.inflows) {
         await createJournalEntryFromTransaction(`${description} | Inflow`, [
            { accountId: leg.accountId, debit: leg.amount_usd, credit: 0 },
            { accountId: clientAccountId, debit: 0, credit: leg.amount_usd },
        ]);
    }
    
    // Process all outflows
    for (const leg of transaction.outflows) {
         await createJournalEntryFromTransaction(`${description} | Outflow`, [
            { accountId: clientAccountId, debit: leg.amount_usd, credit: 0 },
            { accountId: leg.accountId, debit: 0, credit: leg.amount_usd },
        ]);
    }

    // Process the fee
    if (transaction.summary.fee_usd > 0.001) {
        await createJournalEntryFromTransaction(`${description} | Fee`, [
            { accountId: clientAccountId, debit: transaction.summary.fee_usd, credit: 0 },
            { accountId: '4002', debit: 0, credit: transaction.summary.fee_usd }, // 4002 = Fee Income
        ]);
    }
    
    // The net_difference_usd is calculated as inflow - (outflow + fee).
    // A positive difference is a gain for the business.
    // A negative difference is a loss for the business.
    const difference = transaction.summary.net_difference_usd;

    if (difference > 0.001) { // Gain for the business
         await createJournalEntryFromTransaction(`${description} | Gain`, [
            { accountId: clientAccountId, debit: difference, credit: 0 },
            { accountId: '4003', debit: 0, credit: difference }, // 4003 = Exchange Rate Profit
        ]);
    } else if (difference < -0.001) { // Loss for the business
        const loss = Math.abs(difference);
        await createJournalEntryFromTransaction(`${description} | Loss`, [
            { accountId: '5002', debit: loss, credit: 0 }, // 5002 = Discounts/Loss Expense
            { accountId: clientAccountId, debit: 0, credit: loss },
        ]);
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
