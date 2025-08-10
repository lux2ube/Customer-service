
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, runTransaction } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, UsdtManualReceipt } from '../types';
import { stripUndefined, logAction, sendTelegramNotification } from './helpers';
import { redirect } from 'next/navigation';


// --- Shared Helper for Sequential IDs ---
async function getNextSequentialId(): Promise<number> {
    const counterRef = ref(db, 'counters/globalRecordId');
    const result = await runTransaction(counterRef, (currentValue) => {
        return (currentValue || 0) + 1;
    });
    if (!result.committed) {
        throw new Error("Failed to get next sequential ID.");
    }
    return result.snapshot.val();
}


// --- USDT Manual Receipt ---
export type UsdtManualReceiptState = {
  errors?: {
    cryptoWalletId?: string[];
    clientId?: string[];
    amount?: string[];
    txid?: string[];
  };
  message?: string;
  success?: boolean;
} | undefined;

const UsdtManualReceiptSchema = z.object({
  date: z.string({ invalid_type_error: 'Please select a date.' }),
  cryptoWalletId: z.string().min(1, 'Please select a crypto wallet.'),
  clientId: z.string().min(1, 'Please select a client.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  walletAddress: z.string().optional(),
  txid: z.string().optional(),
  notes: z.string().optional(),
});

export async function createUsdtManualReceipt(prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
    const validatedFields = UsdtManualReceiptSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to record USDT receipt.',
        };
    }
    
    try {
        const { clientId, cryptoWalletId, ...data } = validatedFields.data;
        
        const [clientSnapshot, walletSnapshot] = await Promise.all([
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, `accounts/${cryptoWalletId}`)),
        ]);
        
        if (!clientSnapshot.exists() || !walletSnapshot.exists()) {
            return { message: 'Client or Crypto Wallet not found.' };
        }

        const client = clientSnapshot.val() as Client;
        const wallet = walletSnapshot.val() as Account;
        const newId = await getNextSequentialId();

        const receiptData: UsdtManualReceipt = {
            id: String(newId),
            ...data,
            clientId,
            clientName: client.name,
            cryptoWalletId,
            cryptoWalletName: wallet.name,
            createdAt: new Date().toISOString(),
            status: 'Completed', // Manual receipts are considered complete
        };

        await set(ref(db, `usdt_receipts/${newId}`), stripUndefined(receiptData));

        await logAction(
            'create_usdt_manual_receipt',
            { type: 'usdt_receipt', id: String(newId), name: `USDT Receipt from ${client.name}` },
            receiptData
        );
        
        // Potential Journal Entry could be added here later if needed

    } catch (error) {
        console.error("Create USDT Manual Receipt Error:", error);
        return { message: 'Database Error: Failed to record receipt.' };
    }
    
    revalidatePath('/financial-records/usdt-manual-receipt');
    return { success: true, message: 'USDT Manual Receipt recorded successfully.' };
}
