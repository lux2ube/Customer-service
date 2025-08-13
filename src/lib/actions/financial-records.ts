
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, ModernUsdtRecord } from '../types';
import { stripUndefined, logAction, getNextSequentialId } from './helpers';
import { redirect } from 'next/navigation';

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
  clientName: z.string().min(1, 'Client name is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  walletAddress: z.string().optional(),
  txid: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
});

export async function createQuickUsdtReceipt(recordId: string | null, prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
    const isEditing = !!recordId;
    const validatedFields = UsdtManualReceiptSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save USDT receipt.',
            success: false,
        };
    }
    
    try {
        const { date, clientId, clientName, cryptoWalletId, amount, txid, walletAddress, notes, status } = validatedFields.data;
        
        const walletSnapshot = await get(ref(db, `accounts/${cryptoWalletId}`));
        
        if (!walletSnapshot.exists()) {
            return { message: 'Crypto Wallet not found.', success: false };
        }

        const wallet = walletSnapshot.val() as Account;
        const newId = recordId || await getNextSequentialId('usdtRecordId');

        const receiptData: Omit<ModernUsdtRecord, 'id'> = {
            date,
            type: 'inflow',
            source: 'Manual',
            status,
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

        const dbRef = ref(db, `modern_usdt_records/${newId}`);
        if(isEditing) {
            await update(dbRef, stripUndefined(receiptData));
        } else {
             await set(dbRef, stripUndefined(receiptData));
        }


        await logAction(
            isEditing ? 'update_usdt_receipt' : 'create_usdt_manual_receipt',
            { type: 'modern_usdt_record', id: String(newId), name: `USDT Manual Receipt from ${clientName}` },
            receiptData
        );
        
        revalidatePath('/modern-usdt-records');
        if(isEditing) {
            redirect('/modern-usdt-records');
        }
        return { success: true, message: `USDT Receipt ${isEditing ? 'updated' : 'recorded'} successfully.` };
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
  clientName: z.string(),
  date: z.string(),
  status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
  recipientAddress: z.string().min(1, 'Recipient address is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  txid: z.string().optional(),
  notes: z.string().optional(),
});

export async function createUsdtManualPayment(recordId: string | null, prevState: UsdtPaymentState, formData: FormData): Promise<UsdtPaymentState> {
    const isEditing = !!recordId;
    const validatedFields = UsdtManualPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.', success: false };
    }
    const { clientId, clientName, date, status, recipientAddress, amount, txid, notes } = validatedFields.data;
    
    try {
        const newId = recordId || await getNextSequentialId('usdtRecordId');

        const paymentData: Omit<ModernUsdtRecord, 'id'> = {
            date,
            type: 'outflow',
            source: 'Manual',
            status,
            clientId,
            clientName: clientName,
            accountId: '1003', // Default USDT wallet, should be made configurable
            accountName: 'USDT Wallet',
            amount,
            clientWalletAddress: recipientAddress,
            txHash: txid,
            notes,
            createdAt: new Date().toISOString(),
        };
        
        const dbRef = ref(db, `modern_usdt_records/${newId}`);
        if (isEditing) {
            await update(dbRef, stripUndefined(paymentData));
        } else {
            await set(dbRef, stripUndefined(paymentData));
        }
        
        await logAction(
            isEditing ? 'update_usdt_payment' : 'create_usdt_manual_payment',
            { type: 'modern_usdt_record', id: String(newId), name: `USDT Payment to ${clientName}` },
            paymentData
        );
        
        revalidatePath('/transactions/modern');
        revalidatePath('/modern-usdt-records');
        if(isEditing) {
            redirect('/modern-usdt-records');
        }
        return { success: true, message: `USDT manual payment ${isEditing ? 'updated' : 'recorded'} successfully.` };
    } catch (e: any) {
        console.error("Error creating manual USDT payment:", e);
        return { message: 'Database Error: Could not record payment.', success: false };
    }
}
