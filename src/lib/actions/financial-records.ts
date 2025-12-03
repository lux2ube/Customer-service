

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, push, update, query, orderByChild, limitToLast } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, UsdtRecord, JournalEntry, CashRecord, FiatRate, ServiceProvider, ClientServiceProvider } from '../types';
import { stripUndefined, logAction, getNextSequentialId, sendTelegramNotification, notifyClientTransaction, getAccountBalanceUpdates } from './helpers';
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
        
        // CRITICAL: When EDITING, check if record was previously unassigned
        // If so, we need to do a TRANSFER instead of creating new journal entry
        let oldRecord: CashRecord | null = null;
        let wasUnassigned = false;
        if (recordId) {
            const oldRecordSnapshot = await get(ref(db, `cash_records/${recordId}`));
            if (oldRecordSnapshot.exists()) {
                oldRecord = oldRecordSnapshot.val() as CashRecord;
                wasUnassigned = !oldRecord.clientId && oldRecord.status === 'Confirmed';
                console.log(`📝 EDIT MODE: Record ${recordId}, wasUnassigned=${wasUnassigned}, oldClientId=${oldRecord.clientId || 'null'}, newClientId=${clientId || 'null'}`);
            }
        }
        
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
        
        const recordData = {
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
            createdAt: oldRecord?.createdAt || new Date().toISOString(),
            ...(recordId && { updatedAt: new Date().toISOString() }),
        } as Omit<CashRecord, 'id'>;

        const recordRef = ref(db, `/cash_records/${newId}`);
        await set(recordRef, stripUndefined(recordData));

        // Log cash record creation/update
        await logAction(recordId ? 'UPDATE_CASH_RECORD' : 'CREATE_CASH_RECORD', { type: 'cash_record', id: newId, name: `Cash ${type} - ${amount} ${account.currency}` }, {
            type,
            amount,
            currency: account.currency,
            amountusd,
            accountId: bankAccountId,
            accountName: account.name,
            clientId: clientId || 'Unassigned',
            clientName: clientName || 'Unassigned',
            status: 'Confirmed',
            wasUnassigned,
            isEdit: !!recordId
        });

        // CRITICAL JOURNAL ENTRY LOGIC:
        // Case 1: EDIT and was unassigned and now has client → TRANSFER (no new bank debit!)
        // Case 2: EDIT and already had client → NO new journal (just updated record)
        // Case 3: NEW record → create journal entry normally
        const client = clientSnapshot?.exists() ? { ...clientSnapshot.val() as Client, id: clientId! } : null;
        
        if (recordId && wasUnassigned && clientId && client) {
            // TRANSFER: Was unassigned (7001), now assigned to client
            console.log(`🔄 EDIT TRANSFER: Record ${recordId} was unassigned, transferring from 7001 to 6000${clientId}`);
            const transferResult = await transferFromUnassignedToClient(newId, 'cash', clientId, client, true);
            if (!transferResult.success) {
                console.error(`❌ Transfer failed during edit:`, transferResult.error);
                // Record already saved, log the error but continue
            } else {
                console.log(`✅ EDIT TRANSFER COMPLETE: Journal entry ${transferResult.journalEntryId}`);
            }
        } else if (recordId && oldRecord?.clientId) {
            // EDIT: Already had client, no new journal entry needed
            console.log(`📝 EDIT: Record ${recordId} already had client, no new journal entry`);
        } else if (!recordId) {
            // NEW: Create journal entry normally
            await createJournalEntriesForConfirmedCashRecord({ ...recordData, id: newId }, client);
        } else if (recordId && !wasUnassigned && !oldRecord?.clientId && clientId) {
            // EDIT: Record was Pending (not confirmed), now confirmed with client
            console.log(`📝 EDIT: Record ${recordId} was Pending, now Confirmed with client`);
            await createJournalEntriesForConfirmedCashRecord({ ...recordData, id: newId }, client);
        }

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
  clientId: z.string().nullable().optional(),
  clientName: z.string().nullable().optional(),
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
        
        // Fetch wallet (always required)
        const walletSnapshot = await get(ref(db, `accounts/${cryptoWalletId}`));
        if (!walletSnapshot.exists()) return { message: 'Crypto Wallet not found.', success: false };
        
        // Fetch client only if clientId provided
        let clientSnapshot = null;
        let client: Client | null = null;
        if (clientId) {
            clientSnapshot = await get(ref(db, `clients/${clientId}`));
            if (!clientSnapshot.exists()) return { message: 'Client not found.', success: false };
            client = { ...clientSnapshot.val() as Client, id: clientId };
        }

        const wallet = walletSnapshot.val() as Account;
        const newId = recordId || await getNextSequentialId('modernUsdtRecordId');
        
        // CRITICAL: When EDITING, check if record was previously unassigned (e.g., BSCScan synced)
        let existingRecord: Partial<UsdtRecord> = {};
        let wasUnassigned = false;
        if (recordId) {
            const existingSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
            if (existingSnapshot.exists()) {
                existingRecord = existingSnapshot.val();
                wasUnassigned = !existingRecord.clientId && existingRecord.status === 'Confirmed';
                console.log(`📝 USDT RECEIPT EDIT MODE: Record ${recordId}, wasUnassigned=${wasUnassigned}, oldClientId=${existingRecord.clientId || 'null'}, newClientId=${clientId || 'null'}`);
            }
        }
        
        const receiptData = {
            date: date!, type: 'inflow' as const, 
            source: existingRecord.source || 'Manual' as const, 
            status: 'Confirmed' as const,
            clientId: clientId || null, 
            clientName: clientName || null, 
            accountId: cryptoWalletId!,
            accountName: wallet.name, amount: amount!, clientWalletAddress: walletAddress,
            txHash: txid, notes, 
            createdAt: existingRecord.createdAt || new Date().toISOString(),
            ...(recordId && { updatedAt: new Date().toISOString() }),
        } as Omit<UsdtRecord, 'id'>;

        const recordRef = ref(db, `/modern_usdt_records/${newId}`);
        await set(recordRef, stripUndefined(receiptData));

        // Log USDT receipt creation/update
        await logAction(recordId ? 'UPDATE_USDT_RECEIPT' : 'CREATE_USDT_RECEIPT', { type: 'usdt_record', id: newId, name: `USDT Receipt - ${amount} USDT` }, {
            amount,
            currency: 'USDT',
            clientId: clientId || 'Unassigned',
            clientName: clientName || 'Unassigned',
            accountId: cryptoWalletId,
            accountName: wallet.name,
            walletAddress,
            txHash: txid,
            status: 'Confirmed',
            wasUnassigned,
            isEdit: !!recordId
        });

        // CRITICAL JOURNAL ENTRY LOGIC (same as cash):
        // Case 1: EDIT and was unassigned and now has client → TRANSFER (no new wallet debit!)
        // Case 2: EDIT and already had client → NO new journal (just updated record)
        // Case 3: NEW record with client → create journal entry with client
        // Case 4: NEW record without client → create journal entry to unassigned (7002)
        // Case 5: EDIT from Pending to Confirmed → create normal journal entry
        
        if (recordId && wasUnassigned && clientId && client) {
            // TRANSFER: Was unassigned (7002), now assigned to client
            console.log(`🔄 USDT RECEIPT EDIT TRANSFER: Record ${recordId} was unassigned, transferring from 7002 to 6000${clientId}`);
            const transferResult = await transferFromUnassignedToClient(newId, 'usdt', clientId, client, true);
            if (!transferResult.success) {
                console.error(`❌ USDT Receipt Transfer failed during edit:`, transferResult.error);
            } else {
                console.log(`✅ USDT RECEIPT EDIT TRANSFER COMPLETE: Journal entry ${transferResult.journalEntryId}`);
            }
        } else if (recordId && existingRecord.clientId) {
            // EDIT: Already had client, no new journal entry needed
            console.log(`📝 USDT RECEIPT EDIT: Record ${recordId} already had client, no new journal entry`);
        } else if (recordId && !wasUnassigned && !existingRecord.clientId && clientId && client) {
            // EDIT: Record was Pending (not confirmed), now confirmed with client
            console.log(`📝 USDT RECEIPT EDIT: Record ${recordId} was Pending, now Confirmed with client`);
            await createJournalEntriesForConfirmedUsdtRecord({ ...receiptData, id: newId }, client);
        } else if (!recordId) {
            // NEW: Create journal entry normally (with client or unassigned)
            await createJournalEntriesForConfirmedUsdtRecord({ ...receiptData, id: newId }, client);
        }

        // Notify client only if we have client info
        if (clientId && clientName) {
            await notifyClientTransaction(clientId, clientName, { ...receiptData, currency: 'USDT', amountusd: amount });
        }

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
  updatedClientServiceProviders?: ClientServiceProvider[];
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
        
        // CRITICAL: When EDITING, check if record was previously unassigned
        let existingRecord: Partial<UsdtRecord> = {};
        let wasUnassigned = false;
        if (recordId) {
            const existingSnapshot = await get(ref(db, `modern_usdt_records/${recordId}`));
            if (existingSnapshot.exists()) {
                existingRecord = existingSnapshot.val();
                wasUnassigned = !existingRecord.clientId && existingRecord.status === 'Confirmed';
                console.log(`📝 USDT EDIT MODE: Record ${recordId}, wasUnassigned=${wasUnassigned}, oldClientId=${existingRecord.clientId || 'null'}, newClientId=${clientId || 'null'}`);
            }
        }
        
        const paymentData = {
            ...existingRecord,
            date: date!, 
            type: 'outflow' as const, 
            source: (source === 'BSCScan' ? 'BSCScan' : 'Manual') as 'Manual' | 'BSCScan', 
            status: 'Confirmed' as const,
            clientId: clientId, 
            clientName: clientName, 
            accountId: accountId,
            accountName: accountName, 
            amount: amount!, 
            clientWalletAddress: recipientAddress,
            txHash: txid, 
            notes, 
            createdAt: existingRecord.createdAt || new Date().toISOString(),
            ...(recordId && { updatedAt: new Date().toISOString() }),
        } as Omit<UsdtRecord, 'id'>;

        const recordRef = ref(db, `/modern_usdt_records/${newId}`);
        await set(recordRef, stripUndefined(paymentData));

        // Log USDT payment creation/update
        await logAction(recordId ? 'UPDATE_USDT_PAYMENT' : 'CREATE_USDT_PAYMENT', { type: 'usdt_record', id: newId, name: `USDT Payment - ${amount} USDT` }, {
            amount,
            currency: 'USDT',
            clientId: clientId || 'Unassigned',
            clientName: clientName || 'Unassigned',
            accountId,
            accountName,
            recipientAddress,
            txHash: txid,
            status: 'Confirmed',
            wasUnassigned,
            isEdit: !!recordId
        });

        // CRITICAL JOURNAL ENTRY LOGIC (same as cash):
        // Case 1: EDIT and was unassigned and now has client → TRANSFER (no new wallet debit!)
        // Case 2: EDIT and already had client → NO new journal (just updated record)
        // Case 3: NEW record → create journal entry normally
        if (recordId && wasUnassigned && clientId) {
            // TRANSFER: Was unassigned (7002), now assigned to client
            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            if (clientSnapshot?.exists()) {
                const client = { ...clientSnapshot.val() as Client, id: clientId };
                console.log(`🔄 USDT EDIT TRANSFER: Record ${recordId} was unassigned, transferring from 7002 to 6000${clientId}`);
                const transferResult = await transferFromUnassignedToClient(newId, 'usdt', clientId, client, true);
                if (!transferResult.success) {
                    console.error(`❌ USDT Transfer failed during edit:`, transferResult.error);
                } else {
                    console.log(`✅ USDT EDIT TRANSFER COMPLETE: Journal entry ${transferResult.journalEntryId}`);
                }
            }
        } else if (recordId && existingRecord.clientId) {
            // EDIT: Already had client, no new journal entry needed
            console.log(`📝 USDT EDIT: Record ${recordId} already had client, no new journal entry`);
        } else if (!recordId && clientId) {
            // NEW: Create journal entry normally
            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            const client = clientSnapshot?.exists() ? { ...clientSnapshot.val() as Client, id: clientId } : null;
            await createJournalEntriesForConfirmedUsdtRecord({ ...paymentData, id: newId }, client);
        } else if (!recordId && !clientId) {
            // NEW without client: Create unassigned journal entry
            await createJournalEntriesForConfirmedUsdtRecord({ ...paymentData, id: newId }, null);
        } else if (recordId && !wasUnassigned && !existingRecord.clientId && clientId) {
            // EDIT: Record was Pending (not confirmed), now confirmed with client
            console.log(`📝 USDT EDIT: Record ${recordId} was Pending, now Confirmed with client`);
            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            const client = clientSnapshot?.exists() ? { ...clientSnapshot.val() as Client, id: clientId } : null;
            await createJournalEntriesForConfirmedUsdtRecord({ ...paymentData, id: newId }, client);
        }

        // Store provider details in client profile if present
        let updatedServiceProviders: ClientServiceProvider[] | undefined;
        if (clientId && recipientDetails && providerId && providerData) {
            try {
                const detailsObj = JSON.parse(recipientDetails);
                const clientRef = ref(db, `clients/${clientId}`);
                const clientSnapshot = await get(clientRef);
                
                if (clientSnapshot.exists()) {
                    const client = clientSnapshot.val();
                    const serviceProviders: ClientServiceProvider[] = client.serviceProviders || [];
                    
                    // Check if this provider already exists for the client
                    const existingIndex = serviceProviders.findIndex((sp) => sp.providerId === providerId);
                    
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
                    updatedServiceProviders = serviceProviders;
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
        return { 
            success: true, 
            message: 'USDT manual payment recorded successfully.', 
            newRecordId: newId,
            updatedClientServiceProviders: updatedServiceProviders,
        };
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
        
        const record = snapshot.val() as CashRecord;
        await update(recordRef, { status: 'Cancelled' });
        
        // Log cancellation
        await logAction('CANCEL_CASH_PAYMENT', { type: 'cash_record', id: recordId, name: `Cash ${record.type}` }, {
            previousStatus: record.status,
            newStatus: 'Cancelled',
            amount: record.amount,
            currency: record.currency,
            amountusd: record.amountusd,
            clientId: record.clientId || 'Unassigned'
        });
        
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
 * UNASSIGNED: Record to 7001 (unmatched cash USD) until assigned to client
 * ASSIGNED: DEBIT bank account (asset ↑), CREDIT client account (liability ↓)
 */
async function createJournalEntriesForConfirmedCashRecord(record: CashRecord & { id: string }, client: Client | null) {
    try {
        // Ensure 7001 account exists (unmatched cash - USD)
        const account7001Ref = ref(db, 'accounts/7001');
        const account7001Snapshot = await get(account7001Ref);
        if (!account7001Snapshot.exists()) {
            await set(account7001Ref, {
                id: '7001',
                name: 'Unmatched Cash',
                type: 'Liabilities',
                isGroup: false,
                currency: 'USD',
                createdAt: new Date().toISOString()
            });
            console.log('✅ Created account 7001 (Unmatched Cash - USD)');
        }

        const journalRef = push(ref(db, 'journal_entries'));
        const date = new Date().toISOString();

        // If unassigned, record goes to account 7001 (unmatched cash USD)
        // INFLOW (receipt): Debit 7001 (liability UP), Credit bank (asset records credit)
        // OUTFLOW (payment): Credit 7001 (liability DOWN), Debit bank
        if (!record.clientId || !client) {
            const debitAcc = record.type === 'inflow' ? '7001' : record.accountId;
            const creditAcc = record.type === 'inflow' ? record.accountId : '7001';
            
            const [debitBefore, creditBefore] = await Promise.all([
                calculateAccountBalanceBefore(debitAcc, record.date),
                calculateAccountBalanceBefore(creditAcc, record.date)
            ]);

            const entry: Omit<JournalEntry, 'id'> = {
                date: record.date,
                description: `Cash ${record.type === 'inflow' ? 'Receipt' : 'Payment'} (Unmatched) - Rec #${record.id}`,
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
                debit_account_name: record.type === 'inflow' ? 'Unmatched Cash' : record.accountName,
                credit_account_name: record.type === 'inflow' ? record.accountName : 'Unmatched Cash',
            };
            
            // Combine journal entry and balance updates in single atomic update
            const balanceUpdates = await getAccountBalanceUpdates(debitAcc, creditAcc, record.amountusd, date);
            const atomicUpdates: { [path: string]: any } = {
                [`journal_entries/${journalRef.key}`]: entry,
                ...balanceUpdates
            };
            await update(ref(db), atomicUpdates);
            
            console.log(`✅ Journal entry created for unmatched cash record ${record.id} → account 7001`);
            return { success: true };
        }

        // If assigned, normal client account entry
        // INFLOW (receipt): Debit client (liability UP), Credit bank (asset records credit)
        // OUTFLOW (payment): Credit client (liability DOWN), Debit bank
        const clientAccountId = `6000${client.id}`;
        const debitAcc = record.type === 'inflow' ? clientAccountId : record.accountId;
        const creditAcc = record.type === 'inflow' ? record.accountId : clientAccountId;
        
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
            debit_account_name: record.type === 'inflow' ? client.name : record.accountName,
            credit_account_name: record.type === 'inflow' ? record.accountName : client.name,
        };

        // Combine journal entry and balance updates in single atomic update
        const balanceUpdates = await getAccountBalanceUpdates(debitAcc, creditAcc, record.amountusd, date);
        const atomicUpdates: { [path: string]: any } = {
            [`journal_entries/${journalRef.key}`]: entry,
            ...balanceUpdates
        };
        await update(ref(db), atomicUpdates);
        
        console.log(`✅ Journal entry created for confirmed cash record ${record.id}`);
        return { success: true };
    } catch (error) {
        console.error(`❌ Error creating journal entry for cash record ${record.id}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * When a USDT record is confirmed, create journal entries with balance tracking
 * UNASSIGNED: Record to 7002 (unmatched USDT) until assigned to client
 * ASSIGNED: INFLOW debits client (liability UP), OUTFLOW credits client (liability DOWN)
 */
async function createJournalEntriesForConfirmedUsdtRecord(record: UsdtRecord & { id: string }, client: Client | null) {
    try {
        // Ensure 7002 account exists (unmatched USDT)
        const account7002Ref = ref(db, 'accounts/7002');
        const account7002Snapshot = await get(account7002Ref);
        if (!account7002Snapshot.exists()) {
            await set(account7002Ref, {
                id: '7002',
                name: 'Unmatched USDT',
                type: 'Liabilities',
                isGroup: false,
                currency: 'USDT',
                createdAt: new Date().toISOString()
            });
            console.log('✅ Created account 7002 (Unmatched USDT)');
        }

        const journalRef = push(ref(db, 'journal_entries'));
        const date = new Date().toISOString();

        // If unassigned, record goes to account 7002 (unmatched USDT)
        // INFLOW (receipt): Debit 7002 (liability UP), Credit wallet
        // OUTFLOW (payment): Credit 7002 (liability DOWN), Debit wallet
        if (!record.clientId || !client) {
            const debitAcc = record.type === 'inflow' ? '7002' : record.accountId;
            const creditAcc = record.type === 'inflow' ? record.accountId : '7002';
            
            const [debitBefore, creditBefore] = await Promise.all([
                calculateAccountBalanceBefore(debitAcc, record.date),
                calculateAccountBalanceBefore(creditAcc, record.date)
            ]);

            const entry: Omit<JournalEntry, 'id'> = {
                date: record.date,
                description: `USDT ${record.type === 'inflow' ? 'Receipt' : 'Payment'} (Unmatched) - Rec #${record.id}`,
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
                debit_account_name: record.type === 'inflow' ? 'Unmatched USDT' : record.accountName,
                credit_account_name: record.type === 'inflow' ? record.accountName : 'Unmatched USDT',
            };
            
            // Combine journal entry and balance updates in single atomic update
            const balanceUpdates = await getAccountBalanceUpdates(debitAcc, creditAcc, record.amount, date);
            const atomicUpdates: { [path: string]: any } = {
                [`journal_entries/${journalRef.key}`]: entry,
                ...balanceUpdates
            };
            await update(ref(db), atomicUpdates);
            
            console.log(`✅ Journal entry created for unmatched USDT record ${record.id} → account 7002`);
            return { success: true };
        }

        // If assigned, normal client account entry
        // INFLOW (receipt): Debit client (liability UP), Credit wallet
        // OUTFLOW (payment): Credit client (liability DOWN), Debit wallet
        const clientAccountId = `6000${client.id}`;
        const debitAcc = record.type === 'inflow' ? clientAccountId : record.accountId;
        const creditAcc = record.type === 'inflow' ? record.accountId : clientAccountId;
        
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
            debit_account_name: record.type === 'inflow' ? client.name : record.accountName,
            credit_account_name: record.type === 'inflow' ? record.accountName : client.name,
        };

        // Combine journal entry and balance updates in single atomic update
        const balanceUpdates = await getAccountBalanceUpdates(debitAcc, creditAcc, record.amount, date);
        const atomicUpdates: { [path: string]: any } = {
            [`journal_entries/${journalRef.key}`]: entry,
            ...balanceUpdates
        };
        await update(ref(db), atomicUpdates);
        
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

        // Log status change
        await logAction('UPDATE_CASH_RECORD_STATUS', { type: 'cash_record', id: recordId, name: `Cash ${record.type}` }, {
            oldStatus,
            newStatus,
            amount: record.amount,
            currency: record.currency,
            clientId: record.clientId || 'Unassigned'
        });

        // If changing to "Confirmed", create journal entry
        // CRITICAL: Firebase snapshot.val() does NOT include the id - we must add it explicitly
        if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
            const clientSnapshot = record.clientId ? await get(ref(db, `clients/${record.clientId}`)) : null;
            const client = clientSnapshot?.exists() && record.clientId 
                ? { ...clientSnapshot.val() as Client, id: record.clientId as string } 
                : null;
            
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
 * Transfer journal entries from 7001/7002 (unmatched) to client account when assigned
 * SIMPLE TRANSFER: Only involves two LIABILITY accounts, NO bank account
 * Entry: DEBIT 7001/7002 (unmatched decreases), CREDIT 6000{clientId} (client account increases)
 * 
 * ATOMIC: Uses Firebase multi-path update to ensure ALL OR NONE
 */
async function transferFromUnassignedToClient(recordId: string, recordType: 'cash' | 'usdt', clientId: string, client: Client, skipRecordUpdate: boolean = false) {
    try {
        const unmatchedAccount = recordType === 'cash' ? '7001' : '7002';
        const clientAccountId = `6000${clientId}`;
        console.log(`🔄 ATOMIC TRANSFER: Record ${recordId} from ${unmatchedAccount} to ${clientAccountId}${skipRecordUpdate ? ' (skip record update)' : ''}`);
        
        // Fetch the record to get its details
        const recordPath = recordType === 'cash' ? 'cash_records' : 'modern_usdt_records';
        const recordSnapshot = await get(ref(db, `${recordPath}/${recordId}`));
        
        if (!recordSnapshot.exists()) {
            console.error(`❌ Record not found: ${recordId}`);
            return { success: false, error: 'Record not found' };
        }

        const record = recordSnapshot.val() as any;
        const amount = recordType === 'cash' ? record.amountusd : record.amount;
        
        if (!amount || amount <= 0) {
            console.error(`❌ Invalid amount for record ${recordId}: ${amount}`);
            return { success: false, error: 'Invalid amount' };
        }

        const date = new Date().toISOString();
        const unmatchedName = recordType === 'cash' ? 'Unmatched Cash' : 'Unmatched USDT';
        
        // Calculate balances BEFORE the transfer
        const [debitBalanceBefore, creditBalanceBefore] = await Promise.all([
            calculateAccountBalanceBefore(unmatchedAccount, record.date),
            calculateAccountBalanceBefore(clientAccountId, record.date)
        ]);
        
        // Generate new journal entry key
        const journalKey = push(ref(db, 'journal_entries')).key;
        
        if (!journalKey) {
            console.error(`❌ Failed to generate journal entry key`);
            return { success: false, error: 'Failed to generate key' };
        }

        // ATOMIC UPDATE: Build multi-path update object
        const atomicUpdates: { [path: string]: any } = {};
        
        // 1. Ensure client account exists (create if needed)
        atomicUpdates[`accounts/${clientAccountId}`] = {
            id: clientAccountId,
            name: client.name,
            type: 'Liabilities',
            isGroup: false,
            currency: 'USD',
            parentId: '6000',
            createdAt: date
        };
        
        // 2. Create transfer journal entry
        // DEBIT: 7001/7002 (unmatched liability decreases)
        // CREDIT: 6000{clientId} (client liability increases)
        atomicUpdates[`journal_entries/${journalKey}`] = {
            date: record.date,
            description: `Transfer ${recordType.toUpperCase()} Rec #${recordId} to ${client.name}`,
            debit_account: unmatchedAccount,
            credit_account: clientAccountId,
            debit_amount: amount,
            credit_amount: amount,
            amount_usd: amount,
            debit_account_balance_before: debitBalanceBefore,
            debit_account_balance_after: debitBalanceBefore - amount,
            credit_account_balance_before: creditBalanceBefore,
            credit_account_balance_after: creditBalanceBefore + amount,
            createdAt: date,
            debit_account_name: unmatchedName,
            credit_account_name: client.name,
            related_record_id: recordId,
            related_record_type: recordType,
            entry_type: 'transfer'
        };
        
        // 3. Update account balances atomically with journal entry
        const balanceUpdates = await getAccountBalanceUpdates(unmatchedAccount, clientAccountId, amount, date);
        Object.assign(atomicUpdates, balanceUpdates);
        
        // 4. Update record with client info (skip if already updated by caller)
        if (!skipRecordUpdate) {
            atomicUpdates[`${recordPath}/${recordId}/clientId`] = clientId;
            atomicUpdates[`${recordPath}/${recordId}/clientName`] = client.name;
            atomicUpdates[`${recordPath}/${recordId}/assignedAt`] = date;
        }
        
        // Execute atomic update
        await update(ref(db), atomicUpdates);
        
        console.log(`✅ ATOMIC TRANSFER COMPLETE:`);
        console.log(`   DEBIT ${unmatchedAccount}: $${amount} (${debitBalanceBefore} → ${debitBalanceBefore - amount})`);
        console.log(`   CREDIT ${clientAccountId}: $${amount} (${creditBalanceBefore} → ${creditBalanceBefore + amount})`);
        console.log(`   Journal Entry: ${journalKey}`);

        // Log the transfer (non-critical, separate from atomic update)
        try {
            await logAction('TRANSFER_RECORD_TO_CLIENT', { type: `${recordType}_record`, id: recordId, name: `Transfer to ${client.name}` }, {
                recordId,
                recordType,
                journalEntryId: journalKey,
                from: unmatchedAccount,
                to: clientAccountId,
                clientId,
                clientName: client.name,
                amount,
                debitBalanceBefore,
                debitBalanceAfter: debitBalanceBefore - amount,
                creditBalanceBefore,
                creditBalanceAfter: creditBalanceBefore + amount
            });
        } catch (logError) {
            console.warn('Non-critical: Failed to log transfer action', logError);
        }

        return { success: true, journalEntryId: journalKey };
    } catch (error) {
        console.error(`❌ ATOMIC TRANSFER FAILED for record ${recordId}:`, error);
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

        // Log status change
        await logAction('UPDATE_USDT_RECORD_STATUS', { type: 'usdt_record', id: recordId, name: `USDT ${record.type}` }, {
            oldStatus,
            newStatus,
            amount: record.amount,
            clientId: record.clientId || 'Unassigned'
        });

        // If changing to "Confirmed", create journal entry
        // CRITICAL: Firebase snapshot.val() does NOT include the id - we must add it explicitly
        if (newStatus === 'Confirmed' && oldStatus !== 'Confirmed') {
            const clientSnapshot = record.clientId ? await get(ref(db, `clients/${record.clientId}`)) : null;
            const client = clientSnapshot?.exists() && record.clientId 
                ? { ...clientSnapshot.val() as Client, id: record.clientId as string } 
                : null;
            
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
 * When assigning a record to a client
 * If confirmed and unassigned → Transfer from 7001/7002 to client account (ATOMIC)
 * Otherwise just update record with client info
 * 
 * ATOMIC GUARANTEE: Transfer includes record update in same multi-path write
 */
export async function assignRecordToClient(recordId: string, recordType: 'cash' | 'usdt', clientId: string) {
    try {
        console.log(`📋 ASSIGN RECORD: ${recordId} (${recordType}) → Client ${clientId}`);
        
        // Fetch client
        // CRITICAL: Firebase snapshot.val() does NOT include the id - we must add it explicitly
        const clientSnapshot = await get(ref(db, `clients/${clientId}`));
        if (!clientSnapshot.exists()) {
            console.error(`❌ Client not found: ${clientId}`);
            return { success: false, message: 'Client not found.' };
        }
        const client = { ...clientSnapshot.val() as Client, id: clientId };

        // Fetch record
        const recordPath = recordType === 'cash' ? 'cash_records' : 'modern_usdt_records';
        const recordSnapshot = await get(ref(db, `${recordPath}/${recordId}`));
        
        if (!recordSnapshot.exists()) {
            console.error(`❌ Record not found: ${recordId}`);
            return { success: false, message: 'Record not found.' };
        }

        const record = recordSnapshot.val() as any;
        const wasUnassigned = !record.clientId;
        const amount = recordType === 'cash' ? record.amountusd : record.amount;
        
        console.log(`📊 Record state: status=${record.status}, wasUnassigned=${wasUnassigned}, amount=$${amount}`);

        // If confirmed AND was unassigned, use ATOMIC transfer
        // Transfer handles BOTH journal entry + record update in single atomic operation
        if (record.status === 'Confirmed' && wasUnassigned) {
            console.log(`🔄 ATOMIC TRANSFER: Record was unassigned, creating transfer entry`);
            const transferResult = await transferFromUnassignedToClient(recordId, recordType, clientId, client);
            
            if (!transferResult.success) {
                console.error(`❌ Transfer failed:`, transferResult.error);
                return { success: false, message: `Transfer failed: ${transferResult.error}` };
            }
            
            console.log(`✅ ATOMIC TRANSFER COMPLETE: Journal entry ${transferResult.journalEntryId}`);
            // NOTE: Record update already happened inside transferFromUnassignedToClient atomically
        } else {
            // Non-atomic cases: just update record (no journal entry needed)
            // Case 1: Record already has a client (reassignment)
            // Case 2: Record not confirmed yet
            if (record.status === 'Confirmed' && !wasUnassigned) {
                console.log(`📝 Record already assigned, just updating client info`);
            } else {
                console.log(`⏭️ Record not confirmed (${record.status}), just updating client info`);
            }
            
            await update(ref(db, `${recordPath}/${recordId}`), { 
                clientId, 
                clientName: client.name,
                updatedAt: new Date().toISOString()
            });
        }

        // Log assignment (non-critical)
        try {
            await logAction('ASSIGN_RECORD_TO_CLIENT', { type: `${recordType}_record`, id: recordId, name: `${recordType.toUpperCase()} Record Assignment` }, {
                recordType,
                recordId,
                clientId,
                clientName: client.name,
                amount,
                wasUnassigned,
                recordStatus: record.status,
                transferCreated: record.status === 'Confirmed' && wasUnassigned
            });
        } catch (logError) {
            console.warn('Non-critical: Failed to log assignment', logError);
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');
        revalidatePath('/accounting/journal');
        revalidatePath('/');
        
        return { success: true, message: 'Record assigned to client.' };
    } catch (error) {
        console.error('❌ Error assigning record to client:', error);
        return { success: false, message: 'Failed to assign record.' };
    }
}
