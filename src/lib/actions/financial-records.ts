
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

export async function createQuickUsdtReceipt(recordId: string | null, prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
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

// --- Editing Actions ---

export type ModernCashRecordState = {
  errors?: { clientId?: string; status?: string; };
  message?: string;
  success?: boolean;
} | undefined;

const EditModernCashRecordSchema = z.object({
    clientId: z.string().min(1, { message: "A client must be selected." }),
    status: z.enum(['Pending', 'Matched', 'Used', 'Cancelled']),
    notes: z.string().optional(),
});

export async function updateModernCashRecord(recordId: string, prevState: ModernCashRecordState, formData: FormData): Promise<ModernCashRecordState> {
    const validatedFields = EditModernCashRecordSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: "Invalid data submitted.", success: false };
    }

    try {
        const recordRef = ref(db, `modern_cash_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        if (!recordSnapshot.exists()) {
            return { message: "The record you are trying to edit does not exist.", success: false };
        }
        const originalRecord = recordSnapshot.val();

        const clientRef = ref(db, `clients/${validatedFields.data.clientId}`);
        const clientSnapshot = await get(clientRef);
        if (!clientSnapshot.exists()) {
            return { message: "The selected client does not exist.", success: false };
        }

        const clientName = clientSnapshot.val().name;

        const updates = {
            ...originalRecord,
            clientId: validatedFields.data.clientId,
            clientName: clientName,
            status: validatedFields.data.status,
            notes: validatedFields.data.notes || originalRecord.notes,
        };
        
        // If an SMS record is being assigned a client, its status should become 'Matched'
        if (originalRecord.source === 'SMS' && originalRecord.status === 'Pending') {
            updates.status = 'Matched';
        }

        await update(recordRef, updates);

        revalidatePath('/modern-cash-records');
        return { success: true, message: "Record updated successfully." };

    } catch (e) {
        console.error("Error updating modern cash record:", e);
        return { success: false, message: "A database error occurred." };
    }
}


export type ModernUsdtRecordState = {
  errors?: { clientId?: string; status?: string; };
  message?: string;
  success?: boolean;
} | undefined;

const EditModernUsdtRecordSchema = z.object({
    clientId: z.string().min(1, { message: "A client must be selected." }),
    status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
    notes: z.string().optional(),
});

export async function updateModernUsdtRecord(recordId: string, prevState: ModernUsdtRecordState, formData: FormData): Promise<ModernUsdtRecordState> {
    const validatedFields = EditModernUsdtRecordSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: "Invalid data submitted.", success: false };
    }

    try {
        const recordRef = ref(db, `modern_usdt_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        if (!recordSnapshot.exists()) {
            return { message: "The record you are trying to edit does not exist.", success: false };
        }
        const originalRecord = recordSnapshot.val();

        const clientRef = ref(db, `clients/${validatedFields.data.clientId}`);
        const clientSnapshot = await get(clientRef);
        if (!clientSnapshot.exists()) {
            return { message: "The selected client does not exist.", success: false };
        }
        const clientName = clientSnapshot.val().name;

        const updates = {
            ...originalRecord,
            clientId: validatedFields.data.clientId,
            clientName: clientName,
            status: validatedFields.data.status,
            notes: validatedFields.data.notes || originalRecord.notes,
        };

        await update(recordRef, updates);

        revalidatePath('/modern-usdt-records');
        return { success: true, message: "Record updated successfully." };

    } catch (e) {
        console.error("Error updating modern USDT record:", e);
        return { success: false, message: "A database error occurred." };
    }
}
