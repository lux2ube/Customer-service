

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Transaction, CryptoFee, ServiceProvider, ClientServiceProvider } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction, getNextSequentialId } from './helpers';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

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
            return { id, ...allCashRecords[id], ...allUsdtRecords[id] };
        }).filter(r => r.status === 'Matched'); // Only use matched records

        if (allLinkedRecords.length !== linkedRecordIds.length) {
            return { message: 'One or more linked records were not found or are not in a "Matched" state.', success: false };
        }
        
        let cryptoFees: CryptoFee | null = null;
        if (cryptoFeesSnapshot.exists()) {
            const data = cryptoFeesSnapshot.val();
            const lastEntryKey = Object.keys(data)[0];
            cryptoFees = data[lastEntryKey];
        } else {
            return { message: 'Crypto fees are not configured in settings.', success: false };
        }
        
        const totalInflowUSD = allLinkedRecords.filter(r => r.type === 'inflow').reduce((sum, r) => sum + r.amountUsd, 0);
        
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

        const newTransaction: Omit<Transaction, 'id'> = {
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
        updates[`/transactions/${newId}`] = stripUndefined(newTransaction);
        
        for (const recordId of linkedRecordIds) {
            if (allCashRecords[recordId]) {
                 updates[`/cash_records/${recordId}/status`] = 'Used';
            } else if (allUsdtRecords[recordId]) {
                 updates[`/usdt_records/${recordId}/status`] = 'Used';
            }
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
