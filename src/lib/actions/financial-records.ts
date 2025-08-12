

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, UsdtManualReceipt, UsdtPayment, ModernUsdtRecord } from '../types';
import { stripUndefined, logAction, getNextSequentialId } from './helpers';

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
  date: z.string({ invalid_type_error: 'Please select a date.' }).optional(),
  cryptoWalletId: z.string().min(1, 'Please select a crypto wallet.'),
  clientId: z.string().min(1, 'Please select a client.'),
  clientName: z.string().min(1, 'Client name is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  walletAddress: z.string().optional(),
  txid: z.string().optional(),
  notes: z.string().optional(),
});

export async function createQuickUsdtReceipt(prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
    const validatedFields = UsdtManualReceiptSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to record USDT receipt.',
            success: false,
        };
    }
    
    try {
        const { date, clientId, clientName, cryptoWalletId, amount, txid, walletAddress, notes } = validatedFields.data;
        
        const walletSnapshot = await get(ref(db, `accounts/${cryptoWalletId}`));
        
        if (!walletSnapshot.exists()) {
            return { message: 'Crypto Wallet not found.', success: false };
        }

        const wallet = walletSnapshot.val() as Account;
        const newId = await getNextSequentialId('usdtRecordId');

        const receiptData: Omit<ModernUsdtRecord, 'id'> = {
            date: date || new Date().toISOString(),
            type: 'inflow',
            source: 'Manual',
            status: 'Confirmed',
            clientId,
            clientName,
            accountId: cryptoWalletId,
            accountName: wallet.name,
            amount,
            clientWalletAddress: walletAddress,
            txHash: txid,
            notes,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `modern_usdt_records/${newId}`), stripUndefined(receiptData));

        await logAction(
            'create_usdt_manual_receipt',
            { type: 'modern_usdt_record', id: String(newId), name: `USDT Manual Receipt from ${clientName}` },
            receiptData
        );
        
        revalidatePath('/financial-records/usdt-manual-receipt');
        revalidatePath('/modern-usdt-records');
        return { success: true, message: 'USDT Manual Receipt recorded successfully.' };
    } catch (error) {
        console.error("Create USDT Manual Receipt Error:", error);
        return { message: 'Database Error: Failed to record receipt.', success: false };
    }
}


// --- USDT Manual Payment ---
export type UsdtPaymentState = {
  errors?: {
    recipientAddress?: string[];
    amount?: string[];
    txid?: string[];
  };
  message?: string;
  success?: boolean;
} | undefined;


const UsdtManualPaymentSchema = z.object({
  clientId: z.string(),
  recipientAddress: z.string().min(1, 'Recipient address is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  txid: z.string().optional(),
});

export async function createUsdtManualPayment(prevState: UsdtPaymentState, formData: FormData): Promise<UsdtPaymentState> {
    const validatedFields = UsdtManualPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.', success: false };
    }
    const { clientId, recipientAddress, amount, txid } = validatedFields.data;
    
    try {
        const clientSnapshot = await get(ref(db, `clients/${clientId}`));
        if (!clientSnapshot.exists()) {
            return { message: 'Error: Could not find client.', success: false };
        }
        const client = clientSnapshot.val() as Client;

        const newId = await getNextSequentialId('usdtRecordId');

        // This should create a ModernUsdtRecord now
        const paymentData: Omit<ModernUsdtRecord, 'id'> = {
            date: new Date().toISOString(),
            type: 'outflow',
            source: 'Manual',
            status: 'Confirmed',
            clientId,
            clientName: client.name,
            accountId: '1003', // Default USDT wallet, should be made configurable
            accountName: 'USDT Wallet',
            amount,
            clientWalletAddress: recipientAddress,
            txHash: txid,
            createdAt: new Date().toISOString(),
        };
        
        await set(ref(db, `modern_usdt_records/${newId}`), stripUndefined(paymentData));
        
        await logAction(
            'create_usdt_manual_payment',
            { type: 'modern_usdt_record', id: String(newId), name: `USDT Payment to ${client.name}` },
            paymentData
        );
        
        revalidatePath('/transactions/modern');
        revalidatePath('/modern-usdt-records');
        return { success: true, message: 'USDT manual payment recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating manual USDT payment:", e);
        return { message: 'Database Error: Could not record payment.', success: false };
    }
}
