
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, ModernUsdtRecord, JournalEntry } from '../types';
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

// A more flexible schema for editing, where some fields might not be submitted if they are disabled.
const EditUsdtRecordSchema = z.object({
    clientId: z.string().min(1, 'Please select a client.'),
    status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
    notes: z.string().optional(),
});

export async function createQuickUsdtReceipt(recordId: string | null, prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
    const isEditing = !!recordId;

    if (isEditing) {
        // --- EDITING LOGIC ---
        const validatedFields = EditUsdtRecordSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to save USDT receipt.', success: false };
        }
        
        try {
            const recordSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
            if (!recordSnapshot.exists()) {
                return { message: 'Record to edit not found.', success: false };
            }
            const existingRecord: ModernUsdtRecord = { id: recordId, ...recordSnapshot.val() };
            
            const clientSnapshot = await get(ref(db, `clients/${validatedFields.data.clientId}`));
            if (!clientSnapshot.exists()) {
                return { message: 'Selected client not found.', success: false };
            }
            const clientName = clientSnapshot.val().name;
            
            const updatedData = {
                ...existingRecord, // Start with the original data
                clientId: validatedFields.data.clientId,
                clientName: clientName,
                status: validatedFields.data.status,
                notes: validatedFields.data.notes,
            };

            await update(ref(db, `modern_usdt_records/${recordId}`), stripUndefined(updatedData));
            revalidatePath('/modern-usdt-records');
            redirect('/modern-usdt-records');

        } catch (error) {
            console.error("Update USDT Manual Receipt Error:", error);
            return { message: 'Database Error: Could not update receipt.', success: false };
        }

    } else {
        // --- CREATION LOGIC ---
        const validatedFields = UsdtManualReceiptSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to save USDT receipt.', success: false, };
        }

        try {
            const data = validatedFields.data;
            const { date, clientId, clientName, cryptoWalletId, amount, txid, walletAddress, notes, status } = data;
            
            const [walletSnapshot, clientSnapshot] = await Promise.all([
                get(ref(db, `accounts/${cryptoWalletId}`)),
                get(ref(db, `clients/${clientId}`))
            ]);
            
            if (!walletSnapshot.exists()) return { message: 'Crypto Wallet not found.', success: false };
            if (!clientSnapshot.exists()) return { message: 'Client not found.', success: false };

            const wallet = walletSnapshot.val() as Account;
            const newId = await getNextSequentialId('usdtRecordId');
            
            const receiptData: Omit<ModernUsdtRecord, 'id'> = {
                date: date!, type: 'inflow', source: 'Manual', status: status!,
                clientId: clientId!, clientName: clientName!, accountId: cryptoWalletId!,
                accountName: wallet.name, amount: amount!, clientWalletAddress: walletAddress,
                txHash: txid, notes, createdAt: new Date().toISOString(),
            };

            await set(ref(db, `modern_usdt_records/${newId}`), stripUndefined(receiptData));

            revalidatePath('/modern-usdt-records');
            return { success: true, message: 'USDT Receipt recorded successfully.' };
        } catch (error) {
            console.error("Create USDT Manual Receipt Error:", error);
            return { message: 'Database Error: Could not record receipt.', success: false };
        }
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

    if (isEditing) {
        // --- EDITING LOGIC ---
        const validatedFields = EditUsdtRecordSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to save USDT payment.', success: false };
        }

        try {
            const recordSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
            if (!recordSnapshot.exists()) {
                return { message: 'Record to edit not found.', success: false };
            }
            const existingRecord: ModernUsdtRecord = { id: recordId, ...recordSnapshot.val() };
            
            const clientSnapshot = await get(ref(db, `clients/${validatedFields.data.clientId}`));
            if (!clientSnapshot.exists()) {
                return { message: 'Selected client not found.', success: false };
            }
            const clientName = clientSnapshot.val().name;

            const updatedData = {
                ...existingRecord, // Start with the original data
                clientId: validatedFields.data.clientId,
                clientName: clientName,
                status: validatedFields.data.status,
                notes: validatedFields.data.notes,
            };

            await update(ref(db, `modern_usdt_records/${recordId}`), stripUndefined(updatedData));
            revalidatePath('/modern-usdt-records');
            redirect('/modern-usdt-records');

        } catch (error) {
            console.error("Update USDT Manual Payment Error:", error);
            return { message: 'Database Error: Could not update payment.', success: false };
        }

    } else {
        // --- CREATION LOGIC ---
        const validatedFields = UsdtManualPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.', success: false };
        }
        const { clientId, clientName, date, status, recipientAddress, amount, txid, notes } = validatedFields.data;
        
        try {
            const newId = await getNextSequentialId('usdtRecordId');
            const paymentData: Omit<ModernUsdtRecord, 'id'> = {
                date: date!, type: 'outflow', source: 'Manual', status: status!,
                clientId: clientId!, clientName: clientName!, accountId: '1003', // Default USDT wallet
                accountName: 'USDT Wallet', amount: amount!, clientWalletAddress: recipientAddress,
                txHash: txid, notes, createdAt: new Date().toISOString(),
            };
            
            await set(ref(db, `modern_usdt_records/${newId}`), stripUndefined(paymentData));
            revalidatePath('/modern-usdt-records');
            return { success: true, message: 'USDT manual payment recorded successfully.' };
        } catch (e: any) {
            console.error("Error creating manual USDT payment:", e);
            return { message: 'Database Error: Could not record payment.', success: false };
        }
    }
}
