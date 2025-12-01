

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
            status: 'Confirmed', // All records confirmed by default (auto-journaled)
            clientId: clientId, // clientId presence = matched/assigned, null = unassigned
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

        // Auto-create journal entry since record is confirmed by default
        const client = clientSnapshot?.exists() ? (clientSnapshot.val() as Client) : null;
        await createJournalEntriesForConfirmedCashRecord({ ...recordData, id: newId }, client);

        if (clientId && clientName) {
            await notifyClientTransaction(clientId, clientName, { ...recordData, currency: account.currency! });
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/'); // For asset balance card
        return { success: true, message: 'Cash record saved and journaled successfully.' };

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
        const newId = recordId || await getNextSequentialId('modernUsdtRecordId');
        
        const receiptData: Omit<UsdtRecord, 'id'> = {
            date: date!, type: 'inflow', source: 'Manual', status: 'Confirmed',
            clientId: clientId!, clientName: clientName!, accountId: cryptoWalletId!,
            accountName: wallet.name, amount: amount!, clientWalletAddress: walletAddress,
            txHash: txid, notes, createdAt: new Date().toISOString(),
        };

        const recordRef = ref(db, `/modern_usdt_records/${newId}`);
        await set(recordRef, stripUndefined(receiptData));

        // Auto-create journal entry since record is confirmed by default
        const client = (clientSnapshot.val() as Client);
        await createJournalEntriesForConfirmedUsdtRecord({ ...receiptData, id: newId }, client);

        await notifyClientTransaction(clientId, clientName, { ...receiptData, currency: 'USDT', amountusd: amount });

        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/'); // For asset balance card
        return { success: true, message: 'USDT Receipt recorded and journaled successfully.' };
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
        let providerData: any = null;
        const providersSnapshot = await get(ref(db, 'serviceProviders'));
        if (providersSnapshot.exists()) {
            const providers = providersSnapshot.val();
            for (const [pId, provider] of Object.entries(providers)) {
                if ((provider as any).accountIds?.includes(accountId)) {
                    providerId = pId;
                    providerData = provider;
                    break;
                }
            }
        }
        
        const newId = recordId || await getNextSequentialId('modernUsdtRecordId');
        
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
            source: (source === 'BSCScan' ? 'BSCScan' : 'Manual') as 'Manual' | 'BSCScan', 
            status: 'Confirmed',
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

        // Auto-create journal entry since record is confirmed by default
        if (clientId) {
            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            const client = clientSnapshot?.exists() ? (clientSnapshot.val() as Client) : null;
            await createJournalEntriesForConfirmedUsdtRecord({ ...paymentData, id: newId }, client);
        }

        // Store provider details in client profile if present
        if (clientId && recipientDetails && providerId && providerData) {
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
                        serviceProviders.push({
                            providerId,
                            providerName: providerData.name,
                            providerType: providerData.type,
                            details: detailsObj,
                        });
                    }
                    
                    await update(clientRef, { serviceProviders });
                    console.log(`Stored provider details for client ${clientId}, provider ${providerId}`);
                } else {
                    console.warn(`Client ${clientId} not found for storing provider details`);
                }
            } catch (e) {
                console.error("Error storing provider details:", e, { recipientDetails });
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

// ===== BALANCE CALCULATION =====

/**
 * Calculate account balance before a transaction (sum of all previous journal entries)
 */
async function calculateAccountBalanceBefore(accountId: string, beforeDate?: string): Promise<number> {
    try {
        const journalSnapshot = await get(ref(db, 'journal_entries'));
        if (!journalSnapshot.exists()) return 0;

        const allEntries = journalSnapshot.val();
        let balance = 0;

        for (const entryId in allEntries) {
            const entry = allEntries[entryId] as JournalEntry;
            
            // Filter by date if provided
            if (beforeDate && new Date(entry.date) >= new Date(beforeDate)) continue;

            if (entry.debit_account === accountId) {
                balance += entry.debit_amount;
            }
            if (entry.credit_account === accountId) {
                balance -= entry.credit_amount;
            }
        }

        return Math.round(balance * 100) / 100;
    } catch (error) {
        console.error(`Error calculating balance for account ${accountId}:`, error);
        return 0;
    }
}

// ===== AUTO-JOURNAL ENTRIES FOR CONFIRMED RECORDS =====

/**
 * When a cash record is confirmed, create journal entries with balance tracking
 * UNASSIGNED: Record to 7000 (unassigned liability) until assigned to client
 * ASSIGNED: DEBIT bank account (asset ↑), CREDIT client account (liability ↓)
 */
async function createJournalEntriesForConfirmedCashRecord(record: CashRecord & { id: string }, client: Client | null) {
    try {
        const journalRef = push(ref(db, 'journal_entries'));
        const date = new Date().toISOString();

        // If unassigned, record goes to account 7000 (unassigned liability)
        if (!record.clientId || !client) {
            const debitAcc = record.type === 'inflow' ? record.accountId : '7000';
            const creditAcc = record.type === 'inflow' ? '7000' : record.accountId;
            
            const [debitBefore, creditBefore] = await Promise.all([
                calculateAccountBalanceBefore(debitAcc, record.date),
                calculateAccountBalanceBefore(creditAcc, record.date)
            ]);

            const entry: Omit<JournalEntry, 'id'> = {
                date: record.date,
                description: `Cash ${record.type === 'inflow' ? 'Receipt' : 'Payment'} (Unassigned) - Rec #${record.id}`,
                debit_account: debitAcc,
                credit_account: creditAcc,
                debit_amount: record.amountusd,
                credit_amount: record.amountusd,
                amount_usd: record.amountusd,
                debit_account_balance_before: debitBefore,
                debit_account_balance_after: debitBefore + record.amountusd,
                credit_account_balance_before: creditBefore,
                credit_account_balance_after: creditBefore - record.amountusd,
                createdAt: date,
                debit_account_name: debitAcc === '7000' ? 'Unassigned Receipts/Payments' : record.accountName,
                credit_account_name: creditAcc === '7000' ? 'Unassigned Receipts/Payments' : record.accountName,
            };
            await set(journalRef, entry);
            console.log(`✅ Journal entry created for unassigned cash record ${record.id} → account 7000`);
            return { success: true };
        }

        // If assigned, normal client account entry
        const clientAccountId = `6000${client.id}`;
        const debitAcc = record.type === 'inflow' ? record.accountId : clientAccountId;
        const creditAcc = record.type === 'inflow' ? clientAccountId : record.accountId;
        
        const [debitBefore, creditBefore] = await Promise.all([
            calculateAccountBalanceBefore(debitAcc, record.date),
            calculateAccountBalanceBefore(creditAcc, record.date)
        ]);

        const entry: Omit<JournalEntry, 'id'> = {
            date: record.date,
            description: `Cash ${record.type === 'inflow' ? 'Receipt' : 'Payment'} - Rec #${record.id} | ${client.name}`,
            debit_account: debitAcc,
            credit_account: creditAcc,
            debit_amount: record.amountusd,
            credit_amount: record.amountusd,
            amount_usd: record.amountusd,
            debit_account_balance_before: debitBefore,
            debit_account_balance_after: debitBefore + record.amountusd,
            credit_account_balance_before: creditBefore,
            credit_account_balance_after: creditBefore - record.amountusd,
            createdAt: date,
            debit_account_name: record.type === 'inflow' ? record.accountName : client.name,
            credit_account_name: record.type === 'inflow' ? client.name : record.accountName,
        };

        await set(journalRef, entry);
        console.log(`✅ Journal entry created for confirmed cash record ${record.id}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error creating journal entry for cash record ${record.id}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * When a USDT record is confirmed, create journal entries with balance tracking
 * UNASSIGNED: Record to 7000 until assigned to client
 * ASSIGNED: DEBIT wallet account (asset ↑), CREDIT client account (liability ↓)
 */
async function createJournalEntriesForConfirmedUsdtRecord(record: UsdtRecord & { id: string }, client: Client | null) {
    try {
        const journalRef = push(ref(db, 'journal_entries'));
        const date = new Date().toISOString();

        // If unassigned, record goes to account 7000
        if (!record.clientId || !client) {
            const debitAcc = record.type === 'inflow' ? record.accountId : '7000';
            const creditAcc = record.type === 'inflow' ? '7000' : record.accountId;
            
            const [debitBefore, creditBefore] = await Promise.all([
                calculateAccountBalanceBefore(debitAcc, record.date),
                calculateAccountBalanceBefore(creditAcc, record.date)
            ]);

            const entry: Omit<JournalEntry, 'id'> = {
                date: record.date,
                description: `USDT ${record.type === 'inflow' ? 'Receipt' : 'Payment'} (Unassigned) - Rec #${record.id}`,
                debit_account: debitAcc,
                credit_account: creditAcc,
                debit_amount: record.amount,
                credit_amount: record.amount,
                amount_usd: record.amount,
                debit_account_balance_before: debitBefore,
                debit_account_balance_after: debitBefore + record.amount,
                credit_account_balance_before: creditBefore,
                credit_account_balance_after: creditBefore - record.amount,
                createdAt: date,
                debit_account_name: debitAcc === '7000' ? 'Unassigned Receipts/Payments' : record.accountName,
                credit_account_name: creditAcc === '7000' ? 'Unassigned Receipts/Payments' : record.accountName,
            };
            await set(journalRef, entry);
            console.log(`✅ Journal entry created for unassigned USDT record ${record.id} → account 7000`);
            return { success: true };
        }

        // If assigned, normal client account entry
        const clientAccountId = `6000${client.id}`;
        const debitAcc = record.type === 'inflow' ? record.accountId : clientAccountId;
        const creditAcc = record.type === 'inflow' ? clientAccountId : record.accountId;
        
        const [debitBefore, creditBefore] = await Promise.all([
            calculateAccountBalanceBefore(debitAcc, record.date),
            calculateAccountBalanceBefore(creditAcc, record.date)
        ]);

        const entry: Omit<JournalEntry, 'id'> = {
            date: record.date,
            description: `USDT ${record.type === 'inflow' ? 'Receipt' : 'Payment'} - Rec #${record.id} | ${client.name}`,
            debit_account: debitAcc,
            credit_account: creditAcc,
            debit_amount: record.amount,
            credit_amount: record.amount,
            amount_usd: record.amount,
            debit_account_balance_before: debitBefore,
            debit_account_balance_after: debitBefore + record.amount,
            credit_account_balance_before: creditBefore,
            credit_account_balance_after: creditBefore - record.amount,
            createdAt: date,
            debit_account_name: record.type === 'inflow' ? record.accountName : client.name,
            credit_account_name: record.type === 'inflow' ? client.name : record.accountName,
        };

        await set(journalRef, entry);
        console.log(`✅ Journal entry created for confirmed USDT record ${record.id}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error creating journal entry for USDT record ${record.id}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * Update record status and create journal entries if status changes to "Confirmed"
 */
export async function updateCashRecordStatus(recordId: string, newStatus: 'Pending' | 'Confirmed' | 'Cancelled' | 'Used') {
    try {
        const recordRef = ref(db, `cash_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        
        if (!recordSnapshot.exists()) {
            return { success: false, message: 'Cash record not found.' };
        }

        const record = recordSnapshot.val() as CashRecord;
        const oldStatus = record.status;

        // Update status
        await update(recordRef, { status: newStatus });

        // If changing to "Confirmed", create journal entry
        if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
            const clientSnapshot = record.clientId ? await get(ref(db, `clients/${record.clientId}`)) : null;
            const client = clientSnapshot?.exists() ? clientSnapshot.val() as Client : null;
            
            await createJournalEntriesForConfirmedCashRecord({ ...record, id: recordId }, client);
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/accounting/journal');
        return { success: true, message: `Cash record status updated to ${newStatus}` };
    } catch (error) {
        console.error('Error updating cash record status:', error);
        return { success: false, message: 'Failed to update record status.' };
    }
}

/**
 * Transfer journal entries from 7000 (unassigned) to client account when assigned
 * Creates reversing entries on 7000 and new entries on client account
 */
async function transferFromUnassignedToClient(recordId: string, recordType: 'cash' | 'usdt', clientId: string, client: Client) {
    try {
        console.log(`🔄 Transferring record ${recordId} from 7000 to client ${clientId}`);
        
        // Fetch the record to get its details
        const recordRef = recordType === 'cash' 
            ? ref(db, `cash_records/${recordId}`)
            : ref(db, `modern_usdt_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        
        if (!recordSnapshot.exists()) {
            console.error(`Record not found: ${recordId}`);
            return { success: false };
        }

        const record = recordSnapshot.val() as any;
        const clientAccountId = `6000${clientId}`;
        const amount = recordType === 'cash' ? record.amountusd : record.amount;
        const date = new Date().toISOString();

        // Create reversing entry: Remove from 7000
        const reversingRef = push(ref(db, 'journal_entries'));
        const reversingEntry: Omit<JournalEntry, 'id'> = {
            date: record.date,
            description: `[Reversal] ${recordType.toUpperCase()} ${record.type === 'inflow' ? 'Receipt' : 'Payment'} - Rec #${recordId} | Removed from Unassigned`,
            debit_account: record.type === 'inflow' ? '7000' : record.accountId,
            credit_account: record.type === 'inflow' ? record.accountId : '7000',
            debit_amount: amount,
            credit_amount: amount,
            amount_usd: amount,
            createdAt: date,
            debit_account_name: record.type === 'inflow' ? 'Unassigned Receipts/Payments' : record.accountName,
            credit_account_name: record.type === 'inflow' ? record.accountName : 'Unassigned Receipts/Payments',
        };
        await set(reversingRef, reversingEntry);

        // Create new entry: Add to client account
        const newRef = push(ref(db, 'journal_entries'));
        const newEntry: Omit<JournalEntry, 'id'> = {
            date: record.date,
            description: `${recordType.toUpperCase()} ${record.type === 'inflow' ? 'Receipt' : 'Payment'} (Now Assigned) - Rec #${recordId} | ${client.name}`,
            debit_account: record.type === 'inflow' ? record.accountId : clientAccountId,
            credit_account: record.type === 'inflow' ? clientAccountId : record.accountId,
            debit_amount: amount,
            credit_amount: amount,
            amount_usd: amount,
            createdAt: date,
            debit_account_name: record.type === 'inflow' ? record.accountName : client.name,
            credit_account_name: record.type === 'inflow' ? client.name : record.accountName,
        };
        await set(newRef, newEntry);

        console.log(`✅ Transferred record ${recordId} from 7000 to client account ${clientAccountId}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error transferring record ${recordId}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * Update USDT record status and create journal entries if status changes to "Confirmed"
 */
export async function updateUsdtRecordStatus(recordId: string, newStatus: 'Pending' | 'Confirmed' | 'Cancelled' | 'Used') {
    try {
        const recordRef = ref(db, `modern_usdt_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        
        if (!recordSnapshot.exists()) {
            return { success: false, message: 'USDT record not found.' };
        }

        const record = recordSnapshot.val() as UsdtRecord;
        const oldStatus = record.status;
        const wasUnassigned = !record.clientId;

        // Update status
        await update(recordRef, { status: newStatus });

        // If changing to "Confirmed", create journal entry
        if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
            const clientSnapshot = record.clientId ? await get(ref(db, `clients/${record.clientId}`)) : null;
            const client = clientSnapshot?.exists() ? clientSnapshot.val() as Client : null;
            
            await createJournalEntriesForConfirmedUsdtRecord({ ...record, id: recordId }, client);
        }

        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        return { success: true, message: `USDT record status updated to ${newStatus}` };
    } catch (error) {
        console.error('Error updating USDT record status:', error);
        return { success: false, message: 'Failed to update record status.' };
    }
}

/**
 * When assigning a previously unassigned record to a client
 * Move journal entries from 7000 to client account
 */
export async function assignRecordToClient(recordId: string, recordType: 'cash' | 'usdt', clientId: string) {
    try {
        // Fetch client
        const clientSnapshot = await get(ref(db, `clients/${clientId}`));
        if (!clientSnapshot.exists()) {
            return { success: false, message: 'Client not found.' };
        }
        const client = clientSnapshot.val() as Client;

        // Fetch record
        const recordRef = recordType === 'cash'
            ? ref(db, `cash_records/${recordId}`)
            : ref(db, `modern_usdt_records/${recordId}`);
        const recordSnapshot = await get(recordRef);
        
        if (!recordSnapshot.exists()) {
            return { success: false, message: 'Record not found.' };
        }

        const record = recordSnapshot.val() as any;
        const wasUnassigned = !record.clientId;

        // Update record with client info
        await update(recordRef, { clientId, clientName: client.name });

        // If was unassigned and confirmed, transfer from 7000 to client
        if (wasUnassigned && record.status === 'Confirmed') {
            await transferFromUnassignedToClient(recordId, recordType, clientId, client);
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        return { success: true, message: 'Record assigned to client.' };
    } catch (error) {
        console.error('Error assigning record to client:', error);
        return { success: false, message: 'Failed to assign record.' };
    }
}
