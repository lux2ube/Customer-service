

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push, update, query, orderByChild, limitToLast } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, UsdtRecord, JournalEntry, CashRecord, FiatRate } from '../types';
import { stripUndefined, logAction, getNextSequentialId } from './helpers';
import { redirect } from 'next/navigation';


// --- Cash Inflow (Receipt) ---
export type CashReceiptFormState = {
  errors?: {
    bankAccountId?: string[];
    clientId?: string[];
    amount?: string[];
    senderName?: string[];
  };
  message?: string;
  success?: boolean;
} | undefined;


const CashRecordSchema = z.object({
  date: z.string({ invalid_type_error: 'Please select a date.' }),
  bankAccountId: z.string().min(1, 'Please select a bank account.'),
  clientId: z.string().nullable(),
  senderName: z.string().optional(),
  recipientName: z.string().optional(),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  amountUsd: z.coerce.number(),
  remittanceNumber: z.string().optional(),
  note: z.string().optional(),
  type: z.enum(['inflow', 'outflow']),
});


export async function createCashReceipt(recordId: string | null, prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = CashRecordSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save cash record.',
            success: false,
        };
    }
    
    try {
        let { date, clientId, bankAccountId, amount, amountUsd, senderName, recipientName, remittanceNumber, note, type } = validatedFields.data;
        
        const [accountSnapshot, clientSnapshot, fiatRatesSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            clientId ? get(ref(db, `clients/${clientId}`)) : Promise.resolve(null),
            get(query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1)))
        ]);
        
        if (!accountSnapshot.exists()) return { message: 'Bank Account not found.', success: false };

        const account = accountSnapshot.val() as Account;
        const clientName = clientSnapshot?.exists() ? (clientSnapshot.val() as Client).name : null;

        // Server-side calculation of amount_usd as a fallback
        if (amountUsd === 0 && account.currency && account.currency !== 'USD' && fiatRatesSnapshot.exists()) {
             const lastRateEntryKey = Object.keys(fiatRatesSnapshot.val())[0];
             const ratesData = fiatRatesSnapshot.val()[lastRateEntryKey].rates;
             const rateInfo = ratesData[account.currency];
             if (rateInfo) {
                const rate = type === 'inflow' ? rateInfo.clientBuy : rateInfo.clientSell;
                if (rate > 0) {
                    amountUsd = amount / rate;
                }
             }
        }
        
        const newId = recordId || await getNextSequentialId('cashRecordId');
        
        const recordData: Omit<CashRecord, 'id'> = {
            date: date,
            type: type,
            source: 'Manual',
            status: 'Matched', // Manual entries are considered matched
            clientId: clientId,
            clientName: clientName,
            accountId: bankAccountId,
            accountName: account.name,
            senderName: senderName,
            recipientName: recipientName,
            amount: amount,
            currency: account.currency!,
            amount_usd: amountUsd,
            notes: note,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `cash_records/${newId}`), stripUndefined(recordData));

        revalidatePath('/modern-cash-records');
        return { success: true, message: 'Cash record saved successfully.' };

    } catch (error) {
        console.error("Create Cash Record Error:", error);
        return { message: 'Database Error: Could not record transaction.', success: false };
    }
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
  clientName: z.string().min(1, 'Client name is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  walletAddress: z.string().optional(),
  txid: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
});

export async function createUsdtManualReceipt(recordId: string | null, prevState: UsdtManualReceiptState, formData: FormData): Promise<UsdtManualReceiptState> {
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
        const newId = recordId || await getNextSequentialId('usdtRecordId');
        
        const receiptData: Omit<UsdtRecord, 'id'> = {
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
        const newId = recordId || await getNextSequentialId('usdtRecordId');
        const paymentData: Omit<UsdtRecord, 'id'> = {
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


export async function cancelCashPayment(recordId: string) {
    if (!recordId) {
        return { success: false, message: "Record ID is required." };
    }
    try {
        const recordRef = ref(db, `cash_records/${recordId}`);
        const snapshot = await get(recordRef);
        if (!snapshot.exists()) {
            return { success: false, message: "Record not found." };
        }
        await update(recordRef, { status: 'Cancelled' });
        revalidatePath('/modern-cash-records');
        return { success: true, message: "Payment cancelled." };
    } catch (error) {
        console.error(error);
        return { success: false, message: "Failed to cancel payment." };
    }
}

