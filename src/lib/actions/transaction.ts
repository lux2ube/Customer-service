

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, limitToLast } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Transaction, CryptoFee, ServiceProvider, ClientServiceProvider, CashRecord, UsdtRecord, UnifiedFinancialRecord } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction, getNextSequentialId } from './helpers';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

export async function getUnifiedClientRecords(clientId: string): Promise<UnifiedFinancialRecord[]> {
    if (!clientId) return [];

    try {
        const [cashRecordsSnapshot, usdtRecordsSnapshot] = await Promise.all([
            get(query(ref(db, 'cash_records'), orderByChild('clientId'), equalTo(clientId))),
            get(query(ref(db, 'usdt_records'), orderByChild('clientId'), equalTo(clientId))),
        ]);

        const unifiedRecords: UnifiedFinancialRecord[] = [];

        if (cashRecordsSnapshot.exists()) {
            const cashRecords: Record<string, CashRecord> = cashRecordsSnapshot.val();
            Object.entries(cashRecords).forEach(([id, record]) => {
                if (record.status === 'Matched') {
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
            });
        }

        if (usdtRecordsSnapshot.exists()) {
            const usdtRecords: Record<string, UsdtRecord> = usdtRecordsSnapshot.val();
             Object.entries(usdtRecords).forEach(([id, record]) => {
                if (record.status === 'Confirmed') { // USDT records are 'Confirmed' instead of 'Matched'
                     unifiedRecords.push({
                        id,
                        date: record.date,
                        type: record.type,
                        category: 'crypto',
                        source: record.source,
                        amount: record.amount,
                        currency: 'USDT',
                        amountUsd: record.amount, // For USDT, amount is amountUsd
                        status: record.status,
                        cryptoWalletName: record.accountName,
                    });
                }
            });
        }
        
        unifiedRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
    linkedRecordIds: z.array(z.string()).min(1, { message: 'At least one financial record must be linked.' }),
    notes: z.string().optional(),
    attachment: z.instanceof(File).optional(),
});

export async function createModernTransaction(prevState: TransactionFormState, formData: FormData): Promise<TransactionFormState> {
    const validatedFields = ModernTransactionSchema.safeParse({
        clientId: formData.get('clientId'),
        type: formData.get('type'),
        linkedRecordIds: formData.getAll('linkedRecordIds'),
        notes: formData.get('notes'),
        attachment: formData.get('attachment'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    const { clientId, type, linkedRecordIds, notes, attachment } = validatedFields.data;
    const newId = await getNextSequentialId('globalRecordId');
    
    try {
        const [clientSnapshot, cashRecordsSnapshot, usdtRecordsSnapshot, cryptoFeesSnapshot] = await Promise.all([
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, 'cash_records')),
            get(ref(db, 'usdt_records')),
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
            return record ? { ...record, id } : null;
        }).filter(r => r && (r.status === 'Matched' || r.status === 'Confirmed'));


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
        
        const feePercent = (type === 'Deposit' ? cryptoFees.buy_fee_percent : cryptoFees.sell_fee_percent) / 100;
        const minFee = type === 'Deposit' ? cryptoFees.minimum_buy_fee : cryptoFees.minimum_sell_fee;
        const calculatedFee = Math.max(totalInflowUSD * feePercent, totalInflowUSD > 0 ? minFee : 0);
        const finalUsdtAmount = totalInflowUSD - calculatedFee;

        let attachmentUrl = '';
        if (attachment && attachment.size > 0) {
             const fileRef = storageRef(storage, `transaction_attachments/${newId}/${attachment.name}`);
             await uploadBytes(fileRef, attachment);
             attachmentUrl = await getDownloadURL(fileRef);
        }

        const newTransactionData: Partial<Transaction> = {
            date: new Date().toISOString(),
            type,
            clientId,
            clientName: client.name,
            amount_usd: totalInflowUSD,
            fee_usd: calculatedFee,
            amount_usdt: finalUsdtAmount,
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
            const recordPath = allCashRecords[record.id] ? `/cash_records/${record.id}/status` : `/usdt_records/${record.id}/status`;
            updates[recordPath] = 'Used';
        }
        
        await update(ref(db), updates);

        revalidatePath('/transactions/modern');
        revalidatePath('/transactions');
        revalidatePath('/cash_records');
        revalidatePath('/usdt_records');
        
        return { success: true, message: 'Transaction created successfully.' };

    } catch (e: any) {
        console.error("Error creating modern transaction:", e);
        return { message: 'Database Error: Could not create transaction.', success: false };
    }
}
