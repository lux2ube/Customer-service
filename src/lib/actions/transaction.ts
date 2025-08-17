

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
        differenceHandling?: string[];
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
    linkedRecordIds: z.preprocess((val) => (Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean)), z.array(z.string()).min(1, { message: 'At least one financial record must be linked.' })),
    notes: z.string().optional(),
    attachment: z.instanceof(File).optional(),
    differenceHandling: z.enum(['income', 'expense']).optional(),
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
            status: 'Confirmed', // Create as Confirmed immediately
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
            },
            // Include difference handling for journaling
            differenceHandling: differenceHandling,
            incomeAccountId: incomeAccountId,
            expenseAccountId: expenseAccountId
        };
        
        // --- All database changes happen here ---
        const updates: { [key: string]: any } = {};
        updates[`/modern_transactions/${newId}`] = stripUndefined(newTransactionData);
        
        // Mark source records as 'Used'
        for (const record of allLinkedRecords) {
            const recordPath = record.recordType === 'cash' ? `/cash_records/${record.id}` : `/modern_usdt_records/${record.id}`;
            updates[`${recordPath}/status`] = 'Used';
        }
        
        // Create all journal entries
        const journalEntries = createJournalEntriesForTransaction(newTransactionData, client);
        for (const entry of journalEntries) {
            const entryRef = push(ref(db, 'journal_entries'));
            updates[`/journal_entries/${entryRef.key}`] = entry;
        }

        await update(ref(db), updates);

        revalidatePath('/transactions');
        revalidatePath('/accounting/journal');
        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');

        return { success: true, message: `Transaction ${newId} created and confirmed successfully.` };

    } catch (e: any) {
        console.error("Error creating modern transaction:", e);
        return { message: 'Database Error: Could not create transaction.', success: false };
    }
}

export type ConfirmState = { message?: string; error?: boolean; } | undefined;

export async function confirmTransaction(transactionId: string): Promise<ConfirmState> {
    // This function is now OBSOLETE as transactions are confirmed on creation.
    // It's kept here to avoid breaking any potential lingering references, but should be removed later.
    return { error: true, message: "This action is deprecated. Transactions are confirmed upon creation." };
}

function createJournalEntriesForTransaction(transaction: Transaction, client: Client): Omit<JournalEntry, 'id'>[] {
    const description = `Tx #${transaction.id} for ${client.name}`;
    const clientAccountId = `6000${client.id}`;
    const allEntries: Omit<JournalEntry, 'id'>[] = [];
    const date = new Date().toISOString();
    
    // Process all inflows
    for (const leg of transaction.inflows) {
         allEntries.push({
            date,
            description: `${description} | Inflow`,
            debit_account: leg.accountId,
            credit_account: clientAccountId,
            debit_amount: leg.amount,
            credit_amount: leg.amount,
            amount_usd: leg.amount_usd,
            createdAt: date,
            debit_account_name: leg.accountName,
            credit_account_name: client.name,
         });
    }
    
    // Process all outflows
    for (const leg of transaction.outflows) {
         allEntries.push({
            date,
            description: `${description} | Outflow`,
            debit_account: clientAccountId,
            credit_account: leg.accountId,
            debit_amount: leg.amount,
            credit_amount: leg.amount,
            amount_usd: leg.amount_usd,
            createdAt: date,
            debit_account_name: client.name,
            credit_account_name: leg.accountName,
         });
    }

    // Process the fee
    if (transaction.summary.fee_usd > 0.001) {
        allEntries.push({
            date,
            description: `${description} | Fee`,
            debit_account: clientAccountId,
            credit_account: '4002', // 4002 = Fee Income
            debit_amount: transaction.summary.fee_usd,
            credit_amount: transaction.summary.fee_usd,
            amount_usd: transaction.summary.fee_usd,
            createdAt: date,
            debit_account_name: client.name,
            credit_account_name: 'Fee Income',
        });
    }
    
    // The net_difference_usd is calculated as inflow - (outflow + fee).
    // A positive difference is a gain for the business.
    // A negative difference is a loss for the business.
    const difference = transaction.summary.net_difference_usd;

    if (transaction.differenceHandling === 'income' && difference > 0.001) { // Gain for the business
         allEntries.push({
            date,
            description: `${description} | Gain`,
            debit_account: clientAccountId, 
            credit_account: transaction.incomeAccountId!,
            debit_amount: difference,
            credit_amount: difference,
            amount_usd: difference,
            createdAt: date,
            debit_account_name: client.name,
            credit_account_name: `Income: Gain`,
        });
    } else if (transaction.differenceHandling === 'expense' && difference < -0.001) { // Loss for the business
        const loss = Math.abs(difference);
        allEntries.push({
            date,
            description: `${description} | Loss`,
            debit_account: transaction.expenseAccountId!,
            credit_account: clientAccountId,
            debit_amount: loss,
            credit_amount: loss,
            amount_usd: loss,
            createdAt: date,
            debit_account_name: `Expense: Loss`,
            credit_account_name: client.name,
        });
    }

    return allEntries;
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
