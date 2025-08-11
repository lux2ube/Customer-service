

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove, runTransaction } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Transaction, BlacklistItem, FiatRate, CryptoFee, Settings, Currency, CashReceipt, CashPayment, SmsTransaction, Account } from '../types';
import { logAction } from './helpers';

// --- Rate & Fee Actions ---
export type RateFormState = { message?: string; error?: boolean, success?: boolean } | undefined;

export async function updateFiatRates(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
    const data = Object.fromEntries(formData.entries());
    const rates: FiatRate[] = [];

    const currencies = ['YER', 'SAR'];
    for (const currency of currencies) {
        if (data[`${currency}_systemBuy`]) {
            rates.push({
                currency: currency,
                systemBuy: parseFloat(data[`${currency}_systemBuy`] as string || '0'),
                systemSell: parseFloat(data[`${currency}_systemSell`] as string || '0'),
                clientBuy: parseFloat(data[`${currency}_clientBuy`] as string || '0'),
                clientSell: parseFloat(data[`${currency}_clientSell`] as string || '0'),
            });
        }
    }

    try {
        const historyRef = push(ref(db, 'rate_history/fiat_rates'));
        await set(historyRef, {
            rates: rates,
            timestamp: new Date().toISOString()
        });
        
        revalidatePath('/exchange-rates');
        return { success: true, message: 'Fiat rates saved to history.' };
    } catch (error) {
        console.error("Error updating fiat rates:", error);
        return { error: true, message: 'Database error while updating fiat rates.' };
    }
}

const CryptoFeeSchema = z.object({
    buy_fee_percent: z.coerce.number().min(0),
    sell_fee_percent: z.coerce.number().min(0),
    minimum_buy_fee: z.coerce.number().min(0),
    minimum_sell_fee: z.coerce.number().min(0),
});

export async function updateCryptoFees(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
    const validatedFields = CryptoFeeSchema.safeParse(Object.fromEntries(formData.entries()));
    if(!validatedFields.success) {
        return { error: true, message: 'Invalid data provided for crypto fees.' };
    }
    
    try {
        const historyRef = push(ref(db, 'rate_history/crypto_fees'));
        await set(historyRef, {
            ...validatedFields.data,
            timestamp: new Date().toISOString()
        });
        revalidatePath('/exchange-rates');
        return { success: true, message: 'Crypto fees saved to history.' };
    } catch (error) {
        console.error("Error updating crypto fees:", error);
        return { error: true, message: 'Database error while updating crypto fees.' };
    }
}

const ApiSettingsSchema = z.object({
    gemini_api_key: z.string().optional(),
    bsc_api_key: z.string().optional(),
    bsc_wallet_address: z.string().optional(),
});

export async function updateApiSettings(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
     const validatedFields = ApiSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
    if(!validatedFields.success) {
        return { error: true, message: 'Invalid data provided for API settings.' };
    }
    
    try {
        await set(ref(db, 'settings/api'), validatedFields.data);
        revalidatePath('/settings');
        return { success: true, message: 'API settings updated successfully.' };
    } catch (error) {
        console.error("Error updating API settings:", error);
        return { error: true, message: 'Database error while updating API settings.' };
    }
}


// --- Blacklist Actions ---
export type BlacklistFormState = { message?: string } | undefined;
export type ScanState = { message?: string; error?: boolean; } | undefined;

const BlacklistItemSchema = z.object({
    type: z.enum(['Name', 'Phone', 'Address']),
    value: z.string().min(1, { message: 'Value is required.' }),
    reason: z.string().optional(),
});

export async function addBlacklistItem(formData: FormData): Promise<BlacklistFormState> {
    const validatedFields = BlacklistItemSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.value?.[0] || 'Invalid data.' };
    }

    try {
        const newRef = push(ref(db, 'blacklist'));
        await set(newRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/blacklist');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to add item.' };
    }
}

export async function deleteBlacklistItem(id: string): Promise<BlacklistFormState> {
    try {
        await remove(ref(db, `blacklist/${id}`));
        revalidatePath('/blacklist');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to delete item.' };
    }
}

export async function scanClientsWithBlacklist(prevState: ScanState, formData: FormData): Promise<ScanState> {
    try {
        const [clientsSnapshot, blacklistSnapshot] = await Promise.all([
            get(ref(db, 'clients')),
            get(ref(db, 'blacklist'))
        ]);

        if (!clientsSnapshot.exists() || !blacklistSnapshot.exists()) {
            return { message: "No clients or blacklist items to scan.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        const blacklistItems: BlacklistItem[] = Object.values(blacklistSnapshot.val());

        const nameBlacklist = blacklistItems.filter(item => item.type === 'Name');
        const phoneBlacklist = blacklistItems.filter(item => item.type === 'Phone');
        
        let flaggedCount = 0;
        const updates: { [key: string]: any } = {};

        for (const clientId in clientsData) {
            const client = { id: clientId, ...clientsData[clientId] };
            let needsUpdate = false;
            let currentFlags = client.review_flags || [];
            
            for (const item of nameBlacklist) {
                if (!client.name) continue;
                const clientWords = new Set(client.name.toLowerCase().split(/\s+/));
                const blacklistWords = item.value.toLowerCase().split(/\s+/);

                if (blacklistWords.every(word => clientWords.has(word))) {
                    if (!currentFlags.includes('Blacklisted')) {
                        currentFlags.push('Blacklisted');
                        needsUpdate = true;
                    }
                    break;
                }
            }
            
            for (const item of phoneBlacklist) {
                const clientPhones = Array.isArray(client.phone) ? client.phone : [client.phone];
                if (clientPhones.includes(item.value)) {
                    if (!currentFlags.includes('Blacklisted')) {
                        currentFlags.push('Blacklisted');
                        needsUpdate = true;
                    }
                    break;
                }
            }

            if (needsUpdate) {
                updates[`/clients/${clientId}/review_flags`] = currentFlags;
                flaggedCount++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/clients');
        return { message: `Scan complete. Scanned ${Object.keys(clientsData).length} clients and flagged ${flaggedCount} new clients.`, error: false };

    } catch (error: any) {
        console.error("Blacklist Scan Error:", error);
        return { message: error.message || "An unknown error occurred during the scan.", error: true };
    }
}

// --- Currency Actions ---
export type CurrencyFormState = { message?: string; error?: boolean } | undefined;

const CurrencySchema = z.object({
  code: z.string().min(3, "Code must be 3 letters").max(4, "Code must be 3-4 letters").transform(v => v.toUpperCase()),
  name: z.string().min(2, "Name is required."),
});

export async function addCurrency(prevState: CurrencyFormState, formData: FormData): Promise<CurrencyFormState> {
    const validatedFields = CurrencySchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return { error: true, message: validatedFields.error.flatten().fieldErrors.code?.[0] || 'Invalid data.' };
    }
    
    const { code, name } = validatedFields.data;
    
    try {
        const currenciesRef = ref(db, 'settings/currencies');
        const snapshot = await get(currenciesRef);
        const existingCurrencies: Currency[] = snapshot.val() ? Object.values(snapshot.val()) : [];
        if(existingCurrencies.some(c => c.code === code)) {
            return { error: true, message: `Currency with code ${code} already exists.` };
        }

        const newCurrency: Currency = { code, name };
        await update(ref(db, `settings/currencies/${code}`), newCurrency);
        
        revalidatePath('/exchange-rates');
        return { message: 'Currency added.' };
    } catch(error) {
        return { error: true, message: 'Database error: Failed to add currency.' };
    }
}

export async function deleteCurrency(code: string): Promise<CurrencyFormState> {
    try {
        await remove(ref(db, `settings/currencies/${code}`));
        revalidatePath('/exchange-rates');
        return { message: 'Currency deleted.' };
    } catch (error) {
        return { error: true, message: 'Database error: Failed to delete currency.' };
    }
}

// --- One-time Database Setup ---
export type SetupState = { message?: string; error?: boolean; } | undefined;

export async function assignSequentialSmsIds(prevState: SetupState, formData: FormData): Promise<SetupState> {
    try {
        const smsSnapshot = await get(ref(db, 'sms_transactions'));
        if (!smsSnapshot.exists()) {
            return { message: "No SMS records found to assign IDs.", error: false };
        }
        
        const smsRecords: Record<string, SmsTransaction> = smsSnapshot.val();
        const recordsToUpdate = Object.entries(smsRecords).filter(([, record]) => !record.transaction_id || !record.transaction_id.startsWith('S'));

        if (recordsToUpdate.length === 0) {
            return { message: "All SMS records already have sequential IDs.", error: false };
        }
        
        const counterRef = ref(db, 'counters/smsRecordId');
        let newCounterValue: number;
        
        try {
            const transactionResult = await runTransaction(counterRef, (currentValue) => {
                return (currentValue || 0) + recordsToUpdate.length;
            });

            if (!transactionResult.committed) {
                throw new Error("Failed to update SMS counter in a transaction. The operation was aborted.");
            }
            newCounterValue = transactionResult.snapshot.val();
        } catch (error: any) {
            console.error("Firebase transaction failed:", error);
            return { message: `Database transaction error: ${error.message}`, error: true };
        }
        
        let currentId = newCounterValue - recordsToUpdate.length;
        const updates: { [key: string]: any } = {};

        for (const [key] of recordsToUpdate) {
            currentId++;
            updates[`/sms_transactions/${key}/transaction_id`] = `S${currentId}`;
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/sms/transactions');
        return { message: `Successfully assigned unique IDs to ${recordsToUpdate.length} SMS records.`, error: false };

    } catch (e: any) {
        console.error("SMS ID Assignment Error:", e);
        return { message: e.message || 'An unknown error occurred during assignment.', error: true };
    }
}


export async function setupInitialClientIdsAndAccounts(prevState: SetupState, formData: FormData): Promise<SetupState> {
    try {
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);
        if (!clientsSnapshot.exists()) {
            return { message: 'No clients found to migrate.', error: false };
        }

        const oldClientsData: Record<string, Client> = clientsSnapshot.val();
        const clientsArray: (Client & { id: string })[] = Object.keys(oldClientsData).map(key => ({
            id: key,
            ...oldClientsData[key],
        }));

        // Filter out clients that already have the new ID format and sort by creation date
        const clientsToMigrate = clientsArray
            .filter(c => !c.id.match(/^1\d{6,}$/))
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (clientsToMigrate.length === 0) {
            return { message: "All clients already seem to have the new ID format.", error: false };
        }

        const accountsSnapshot = await get(ref(db, 'accounts'));
        const allAccounts = accountsSnapshot.val() || {};

        let lastClientId = 1000000;
        const existingNewFormatIds = new Set(clientsArray.filter(c => c.id.match(/^1\d{6,}$/)).map(c => parseInt(c.id)));
        if (existingNewFormatIds.size > 0) {
            lastClientId = Math.max(...Array.from(existingNewFormatIds));
        }

        const updates: { [key: string]: any } = {};
        const oldToNewIdMap: Record<string, string> = {};

        for (const client of clientsToMigrate) {
            lastClientId++;
            const newClientId = String(lastClientId);
            oldToNewIdMap[client.id] = newClientId;

            // Prepare new client data
            const newClientData = { ...client };
            delete newClientData.id;
            updates[`/clients/${newClientId}`] = newClientData;
            updates[`/clients/${client.id}`] = null; // Delete old client record

            // Prepare new account data for the client
            const newAccountId = `6000${newClientId}`;
            if (!allAccounts[newAccountId]) {
                updates[`/accounts/${newAccountId}`] = {
                    name: client.name || `Unnamed Client (${client.id})`,
                    type: 'Liabilities',
                    isGroup: false,
                    parentId: '6000',
                    currency: 'USD',
                };
            }
        }
        
        // --- Update related records ---
        const pathsToUpdate = ['transactions', 'cash_receipts', 'cash_payments', 'sms_transactions'];
        const recordsToUpdateSnapshots = await Promise.all(pathsToUpdate.map(p => get(ref(db, p))));
        
        recordsToUpdateSnapshots.forEach((snapshot, index) => {
            const path = pathsToUpdate[index];
            if (snapshot.exists()) {
                const records: Record<string, any> = snapshot.val();
                for (const recordId in records) {
                    const record = records[recordId];
                    const oldIdKey = path === 'sms_transactions' ? 'matched_client_id' : 'clientId';
                    
                    if (record[oldIdKey] && oldToNewIdMap[record[oldIdKey]]) {
                        const newId = oldToNewIdMap[record[oldIdKey]];
                        updates[`/${path}/${recordId}/${oldIdKey}`] = newId;

                        // Also update denormalized name if it exists
                        const clientName = (clientsToMigrate.find(c => c.id === record[oldIdKey]))?.name || `Unnamed Client (${record[oldIdKey]})`;
                        const nameKey = path === 'sms_transactions' ? 'matched_client_name' : 'clientName';
                        updates[`/${path}/${recordId}/${nameKey}`] = clientName;
                    }
                }
            }
        });

        await update(ref(db), updates);
        
        revalidatePath('/clients');
        revalidatePath('/accounting/chart-of-accounts');

        return { message: `Successfully migrated ${clientsToMigrate.length} clients to the new ID format.`, error: false };

    } catch (e: any) {
        console.error("Database setup error:", e);
        return { message: e.message || 'An unknown error occurred during setup.', error: true };
    }
}

export async function restructureRecordIds(prevState: SetupState, formData: FormData): Promise<SetupState> {
     const recordTypes = ['transactions', 'cash_receipts', 'cash_payments'];
    let totalRestructured = 0;

    try {
        for (const recordType of recordTypes) {
            const snapshot = await get(ref(db, recordType));
            if (!snapshot.exists()) {
                continue;
            }

            const records: [string, any][] = Object.entries(snapshot.val());
            
            // Filter out records that already have a numeric ID
            const recordsToMigrate = records.filter(([id, record]) => isNaN(parseInt(id)));

            if (recordsToMigrate.length === 0) continue;

            // Sort by creation date to ensure sequential order is meaningful
            recordsToMigrate.sort(([, a], [, b]) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime());

            // Find the highest existing numeric ID to start from
            const numericIds = records
                .map(([id]) => parseInt(id))
                .filter(id => !isNaN(id));
            let counter = numericIds.length > 0 ? Math.max(...numericIds) : 0;
            
            const updates: { [key: string]: any } = {};

            for (const [oldId, recordData] of recordsToMigrate) {
                counter++;
                const newId = String(counter);
                
                // Update the ID field within the object itself
                const newRecordData = { ...recordData, id: newId };

                updates[`/${recordType}/${newId}`] = newRecordData;
                updates[`/${recordType}/${oldId}`] = null; // Delete the old record
            }
            
            if (Object.keys(updates).length > 0) {
                await update(ref(db), updates);
                totalRestructured += recordsToMigrate.length;
            }
        }
        
        if (totalRestructured > 0) {
            revalidatePath('/transactions');
            revalidatePath('/cash-receipts');
            revalidatePath('/cash-payments');
            return { message: `Successfully restructured IDs for ${totalRestructured} records across the system.`, error: false };
        } else {
            return { message: 'No records found that require ID restructuring.', error: false };
        }

    } catch(e: any) {
        console.error("ID Restructuring Error:", e);
        return { message: `An error occurred: ${e.message}`, error: true };
    }
}
