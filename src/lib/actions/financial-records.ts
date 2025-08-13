
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
const EditUsdtManualReceiptSchema = UsdtManualReceiptSchema.partial().extend({
    clientId: z.string().min(1, 'Please select a client.'),
    clientName: z.string().min(1, 'Client name is required.'),
    status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
});

export async function createQuickUsdtReceipt(recordId: string | null, prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
    const isEditing = !!recordId;

    let existingRecord: ModernUsdtRecord | null = null;
    if (isEditing) {
        const recordSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
        if (recordSnapshot.exists()) {
            existingRecord = recordSnapshot.val();
        } else {
            return { message: 'Record to edit not found.', success: false };
        }
    }
    
    // Merge existing data for disabled fields if we are editing
    const rawData = {
        ...existingRecord,
        ...Object.fromEntries(formData.entries()),
    };

    const validatedFields = isEditing
        ? EditUsdtManualReceiptSchema.safeParse(rawData)
        : UsdtManualReceiptSchema.safeParse(rawData);


    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save USDT receipt.',
            success: false,
        };
    }
    
    try {
        const data = validatedFields.data;
        const { date, clientId, clientName, cryptoWalletId, amount, txid, walletAddress, notes, status } = data;
        
        const [walletSnapshot, clientSnapshot] = await Promise.all([
             get(ref(db, `accounts/${cryptoWalletId}`)),
             get(ref(db, `clients/${clientId}`))
        ]);
        
        if (!walletSnapshot.exists()) {
            return { message: 'Crypto Wallet not found.', success: false };
        }
        if (!clientSnapshot.exists()) {
            return { message: 'Client not found.', success: false };
        }

        const wallet = walletSnapshot.val() as Account;
        const newId = recordId || await getNextSequentialId('usdtRecordId');
        
        const updates: { [key: string]: any } = {};

        const receiptData: Omit<ModernUsdtRecord, 'id'> = {
            date: date!,
            type: 'inflow',
            source: existingRecord?.source || 'Manual',
            status: status!,
            clientId: clientId!,
            clientName: clientName!,
            accountId: cryptoWalletId!,
            accountName: wallet.name,
            amount: amount!,
            clientWalletAddress: walletAddress,
            txHash: txid,
            notes,
            createdAt: existingRecord?.createdAt || new Date().toISOString(),
            blockNumber: existingRecord?.blockNumber,
        };

        const dbRef = ref(db, `modern_usdt_records/${newId}`);
        updates[`/modern_usdt_records/${newId}`] = stripUndefined(receiptData);
        
        // Journal Entry: Debit Asset (wallet), Credit Liability (client)
        if (status === 'Confirmed' && (!existingRecord || existingRecord.status !== 'Confirmed')) {
            const clientAccountId = `6000${clientId}`;
            const journalRef = push(ref(db, 'journal_entries'));
            const journalEntry: Omit<JournalEntry, 'id'> = {
                date: date!,
                description: `USDT Receipt from ${clientName} - Ref: ${newId}`,
                debit_account: cryptoWalletId!,
                credit_account: clientAccountId,
                debit_amount: amount!,
                credit_amount: amount!,
                amount_usd: amount!,
                createdAt: new Date().toISOString(),
                debit_account_name: wallet.name,
                credit_account_name: clientName,
            };
            updates[`/journal_entries/${journalRef.key}`] = journalEntry;
        }

        await update(ref(db), updates);

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

const EditUsdtManualPaymentSchema = UsdtManualPaymentSchema.partial().extend({
    clientId: z.string().min(1, 'Please select a client.'),
    clientName: z.string().min(1, 'Client name is required.'),
    status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
});

export async function createUsdtManualPayment(recordId: string | null, prevState: UsdtPaymentState, formData: FormData): Promise<UsdtPaymentState> {
    const isEditing = !!recordId;

    let existingRecord: ModernUsdtRecord | null = null;
    if (isEditing) {
        const recordSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
        if (recordSnapshot.exists()) {
            existingRecord = recordSnapshot.val();
        } else {
            return { message: 'Record to edit not found.', success: false };
        }
    }

    const rawData = {
        ...existingRecord,
        ...Object.fromEntries(formData.entries()),
    };

    const validatedFields = isEditing 
        ? EditUsdtManualPaymentSchema.safeParse(rawData)
        : UsdtManualPaymentSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.', success: false };
    }
    const { clientId, clientName, date, status, recipientAddress, amount, txid, notes } = validatedFields.data;
    
    try {
        const newId = recordId || await getNextSequentialId('usdtRecordId');
        const updates: { [key: string]: any } = {};

        const paymentData: Omit<ModernUsdtRecord, 'id'> = {
            date: date!,
            type: 'outflow',
            source: existingRecord?.source || 'Manual',
            status: status!,
            clientId: clientId!,
            clientName: clientName!,
            accountId: existingRecord?.accountId || '1003', // Default USDT wallet, should be made configurable
            accountName: existingRecord?.accountName || 'USDT Wallet',
            amount: amount!,
            clientWalletAddress: recipientAddress,
            txHash: txid,
            notes,
            createdAt: existingRecord?.createdAt || new Date().toISOString(),
            blockNumber: existingRecord?.blockNumber,
        };
        
        updates[`/modern_usdt_records/${newId}`] = stripUndefined(paymentData);

        // Journal Entry: Debit Liability (client), Credit Asset (wallet)
        if (status === 'Confirmed' && (!existingRecord || existingRecord.status !== 'Confirmed')) {
            const clientAccountId = `6000${clientId}`;
            const journalRef = push(ref(db, 'journal_entries'));
            const journalEntry: Omit<JournalEntry, 'id'> = {
                date: date!,
                description: `Manual USDT Payment to ${clientName} - Ref: ${newId}`,
                debit_account: clientAccountId,
                credit_account: paymentData.accountId,
                debit_amount: amount!,
                credit_amount: amount!,
                amount_usd: amount!,
                createdAt: new Date().toISOString(),
                debit_account_name: clientName!,
                credit_account_name: paymentData.accountName,
            };
            updates[`/journal_entries/${journalRef.key}`] = journalEntry;
        }

        await update(ref(db), updates);
        
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
