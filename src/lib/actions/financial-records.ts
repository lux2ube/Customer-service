

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push, update, query, orderByChild, limitToLast } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, UsdtRecord, JournalEntry, CashRecord, FiatRate, ServiceProvider } from '../types';
import { stripUndefined, logAction, getNextSequentialId, sendTelegramNotification, notifyClientTransaction } from './helpers';
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
  amountusd: z.coerce.number(),
  remittanceNumber: z.string().optional(),
  note: z.string().optional(),
  type: z.enum(['inflow', 'outflow']),
});


export async function createCashReceipt(recordId: string | null, prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = CashRecordSchema.safeParse({
        ...Object.fromEntries(formData.entries()),
        amountusd: formData.get('amountusd') || formData.get('amountUsd')
    });


    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save cash record.',
            success: false,
        };
    }
    
    try {
        let { date, clientId, bankAccountId, amount, amountusd, senderName, recipientName, remittanceNumber, note, type } = validatedFields.data;
        
        const [accountSnapshot, clientSnapshot, fiatRatesSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            clientId ? get(ref(db, `clients/${clientId}`)) : Promise.resolve(null),
            get(query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1)))
        ]);
        
        if (!accountSnapshot.exists()) return { message: 'Bank Account not found.', success: false };

        const account = accountSnapshot.val() as Account;
        const clientName = clientSnapshot?.exists() ? (clientSnapshot.val() as Client).name : null;

        // Server-side calculation of amountusd as a fallback
        if (amountusd === 0 && account.currency && account.currency !== 'USD' && fiatRatesSnapshot.exists()) {
             const lastRateEntryKey = Object.keys(fiatRatesSnapshot.val())[0];
             const ratesData = fiatRatesSnapshot.val()[lastRateEntryKey].rates;
             const rateInfo = ratesData[account.currency];
             if (rateInfo) {
                const rate = type === 'inflow' ? rateInfo.clientBuy : rateInfo.clientSell;
                if (rate > 0) {
                    amountusd = amount / rate;
                }
             }
        }
        
        const newId = recordId || await getNextSequentialId('cashRecordId');
        
        const recordData: Omit<CashRecord, 'id'> = {
            date: date,
            type: type,
            source: 'Manual',
            status: clientId ? 'Matched' : 'Pending', // If client is provided, it's matched
            clientId: clientId,
            clientName: clientName,
            accountId: bankAccountId,
            accountName: account.name,
            senderName: senderName,
            recipientName: recipientName,
            amount: amount,
            currency: account.currency!,
            amountusd: amountusd,
            notes: note,
            createdAt: new Date().toISOString(),
        };

        const recordRef = ref(db, `/cash_records/${newId}`);
        await set(recordRef, stripUndefined(recordData));

        if (clientId && clientName) {
            await notifyClientTransaction(clientId, clientName, { ...recordData, currency: account.currency! });
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/'); // For asset balance card
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

        const recordRef = ref(db, `/modern_usdt_records/${newId}`);
        await set(recordRef, stripUndefined(receiptData));

        await notifyClientTransaction(clientId, clientName, { ...receiptData, currency: 'USDT', amountusd: amount });

        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/'); // For asset balance card
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
    accountId?: string[];
    clientId?: string[];
  };
  message?: string;
  success?: boolean;
  newRecordId?: string;
} | undefined;


const UsdtManualPaymentSchema = z.object({
  clientId: z.string().nullable(),
  clientName: z.string().nullable(),
  date: z.string(),
  status: z.enum(['Pending', 'Used', 'Cancelled', 'Confirmed']),
  recipientAddress: z.string().optional(),
  recipientDetails: z.string().optional(),
  amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
  accountId: z.string().min(1, "A sending wallet must be selected"),
  txid: z.string().optional(),
  notes: z.string().optional(),
  source: z.string().optional(),
});


export async function createUsdtManualPayment(recordId: string | null, prevState: UsdtPaymentState, formData: FormData): Promise<UsdtPaymentState> {
    const validatedFields = UsdtManualPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.', success: false };
    }
    const { clientId, clientName, date, status, recipientAddress, recipientDetails, amount, accountId, txid, notes, source } = validatedFields.data;
    
    try {
        const accountSnapshot = await get(ref(db, `accounts/${accountId}`));
        if (!accountSnapshot.exists()) {
            return { message: 'Selected sending wallet not found.', success: false };
        }
        const accountName = (accountSnapshot.val() as Account).name;
        
        // Get the service provider for this account
        let providerId: string | null = null;
        const providersSnapshot = await get(ref(db, 'serviceProviders'));
        if (providersSnapshot.exists()) {
            const providers = providersSnapshot.val();
            for (const [pId, provider] of Object.entries(providers)) {
                if ((provider as any).accountIds?.includes(accountId)) {
                    providerId = pId;
                    break;
                }
            }
        }
        
        const newId = recordId || await getNextSequentialId('usdtRecordId');
        
        let existingRecord: Partial<UsdtRecord> = {};
        if (recordId) {
            const existingSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
            if (existingSnapshot.exists()) {
                existingRecord = existingSnapshot.val();
            }
        }
        
        const paymentData: Omit<UsdtRecord, 'id'> = {
            ...existingRecord,
            date: date!, 
            type: 'outflow', 
            source: source || 'Manual', 
            status: status!,
            clientId: clientId, 
            clientName: clientName, 
            accountId: accountId,
            accountName: accountName, 
            amount: amount!, 
            clientWalletAddress: recipientAddress,
            txHash: txid, 
            notes, 
            createdAt: existingRecord.createdAt || new Date().toISOString(),
        };

        const recordRef = ref(db, `/modern_usdt_records/${newId}`);
        await set(recordRef, stripUndefined(paymentData));

        // Store provider details in client profile if present
        if (clientId && recipientDetails && providerId) {
            try {
                const detailsObj = JSON.parse(recipientDetails);
                const clientRef = ref(db, `clients/${clientId}`);
                const clientSnapshot = await get(clientRef);
                
                if (clientSnapshot.exists()) {
                    const client = clientSnapshot.val();
                    const serviceProviders = client.serviceProviders || [];
                    
                    // Check if this provider already exists for the client
                    const existingIndex = serviceProviders.findIndex((sp: any) => sp.providerId === providerId);
                    
                    if (existingIndex >= 0) {
                        // Update existing provider details
                        serviceProviders[existingIndex].details = detailsObj;
                    } else {
                        // Add new provider to client profile
                        const provider = (providersSnapshot.val()?.[providerId] || {}) as any;
                        serviceProviders.push({
                            providerId,
                            providerName: provider.name,
                            providerType: provider.type,
                            details: detailsObj,
                        });
                    }
                    
                    await update(clientRef, { serviceProviders });
                }
            } catch (e) {
                console.warn("Could not store provider details:", e);
            }
        }

        if (clientId && clientName) {
            await notifyClientTransaction(clientId, clientName, { ...paymentData, currency: 'USDT', amountusd: amount });
        }
        
        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/'); // For asset balance card
        return { success: true, message: 'USDT manual payment recorded successfully.', newRecordId: newId };
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
