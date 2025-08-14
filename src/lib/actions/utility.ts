

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove, runTransaction } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Transaction, BlacklistItem, FiatRate, CryptoFee, Settings, Currency, CashReceipt, CashPayment, SmsTransaction, Account, UsdtRecord } from '../types';
import { logAction } from './helpers';

// --- Rate & Fee Actions ---
export type RateFormState = { message?: string; error?: boolean, success?: boolean } | undefined;
export type CurrencyFormState = { 
    message?: string; 
    error?: boolean; 
    errors?: {
        code?: string[];
        name?: string[];
        type?: string[];
        decimals?: string[];
    }
} | undefined;


export async function updateFiatRates(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
    const data = Object.fromEntries(formData.entries());
    const rates: Record<string, Omit<FiatRate, 'currency'>> = {};

    // Dynamically find all currency codes from the form data
    const currencyCodes = new Set(Object.keys(data).map(key => key.split('_')[0]));

    for (const code of currencyCodes) {
        const clientBuyKey = `${code}_clientBuy`;
        const clientSellKey = `${code}_clientSell`;
        const systemBuyKey = `${code}_systemBuy`;
        const systemSellKey = `${code}_systemSell`;

        // Check if all four keys for a currency exist before creating an entry
        if (data[clientBuyKey] && data[clientSellKey] && data[systemBuyKey] && data[systemSellKey]) {
             rates[code] = {
                clientBuy: parseFloat(data[clientBuyKey] as string || '0'),
                clientSell: parseFloat(data[clientSellKey] as string || '0'),
                systemBuy: parseFloat(data[systemBuyKey] as string || '0'),
                systemSell: parseFloat(data[systemSellKey] as string || '0'),
            };
        }
    }
    
    if (Object.keys(rates).length === 0) {
        return { error: true, message: 'No complete rate data was submitted.' };
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


export async function updateCryptoRates(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
    const data = Object.fromEntries(formData.entries());
    const rates: Record<string, number> = {};

    for (const key in data) {
        if (typeof data[key] === 'string') {
            const rate = parseFloat(data[key] as string);
            if (!isNaN(rate)) {
                rates[key] = rate;
            }
        }
    }

    if (Object.keys(rates).length === 0) {
        return { error: true, message: 'No valid crypto rate data was submitted.' };
    }

    try {
        const historyRef = push(ref(db, 'rate_history/crypto_rates'));
        await set(historyRef, {
            rates: rates,
            timestamp: new Date().toISOString()
        });
        
        revalidatePath('/exchange-rates');
        return { success: true, message: 'Crypto rates saved to history.' };
    } catch (error) {
        console.error("Error updating crypto rates:", error);
        return { error: true, message: 'Database error while updating crypto rates.' };
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
const CurrencySchema = z.object({
  code: z.string().min(3, "Code must be 3-4 letters").max(4).transform(v => v.toUpperCase()),
  name: z.string().min(2, "Name is required."),
  type: z.enum(['fiat', 'crypto']),
  decimals: z.coerce.number().min(0, "Decimals must be 0 or more.").max(18, "Decimals cannot exceed 18."),
});

export async function addCurrency(prevState: CurrencyFormState, formData: FormData): Promise<CurrencyFormState> {
    const validatedFields = CurrencySchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        const errors = validatedFields.error.flatten().fieldErrors;
        return { error: true, message: 'Failed to add currency.', errors };
    }
    
    const { code, name, type, decimals } = validatedFields.data;
    
    try {
        const currenciesRef = ref(db, 'settings/currencies');
        const snapshot = await get(currenciesRef);
        const existingCurrencies = snapshot.val() || {};
        if(existingCurrencies[code]) {
            return { error: true, message: `Currency with code ${code} already exists.` };
        }

        const newCurrency: Currency = { code, name, type, decimals };
        await update(ref(db, `settings/currencies/${code}`), newCurrency);
        
        revalidatePath('/exchange-rates');
        return { message: 'Currency added successfully.' };
    } catch(error) {
        return { error: true, message: 'Database error: Failed to add currency.' };
    }
}

export async function deleteCurrency(code: string): Promise<CurrencyFormState> {
    try {
        // Simple validation to prevent deleting core currencies by mistake
        if (['USD', 'YER', 'SAR', 'USDT'].includes(code)) {
            return { error: true, message: `Core currency ${code} cannot be deleted.` };
        }
        await remove(ref(db, `settings/currencies/${code}`));
        revalidatePath('/exchange-rates');
        return { message: 'Currency deleted.' };
    } catch (error) {
        return { error: true, message: 'Database error: Failed to delete currency.' };
    }
}

export async function initializeDefaultCurrencies(prevState: RateFormState, formData: FormData): Promise<RateFormState> {
    const defaultCurrencies: Currency[] = [
        { code: 'USD', name: 'US Dollar', type: 'fiat', decimals: 2 },
        { code: 'YER', name: 'Yemeni Rial', type: 'fiat', decimals: 2 },
        { code: 'SAR', name: 'Saudi Riyal', type: 'fiat', decimals: 2 },
        { code: 'USDT', name: 'Tether', type: 'crypto', decimals: 6 },
    ];
    
    try {
        const currenciesRef = ref(db, 'settings/currencies');
        const snapshot = await get(currenciesRef);
        const existingCurrencies = snapshot.val() || {};
        
        const updates: {[key: string]: Currency} = {};
        let addedCount = 0;
        
        for (const currency of defaultCurrencies) {
            if (!existingCurrencies[currency.code]) {
                updates[currency.code] = currency;
                addedCount++;
            }
        }
        
        if (addedCount > 0) {
            await update(currenciesRef, updates);
            revalidatePath('/exchange-rates');
            return { success: true, message: `Successfully initialized ${addedCount} default currencies.` };
        } else {
            return { message: 'Default currencies are already configured.' };
        }
    } catch (error) {
        console.error("Error initializing currencies:", error);
        return { error: true, message: 'Database error while initializing currencies.' };
    }
}


// --- One-time Database Setup & Cleanup ---
export type SetupState = { message?: string; error?: boolean; } | undefined;
export type CleanupState = { message?: string; error?: boolean; } | undefined;

export async function deleteAllModernCashRecords(prevState: CleanupState, formData: FormData): Promise<CleanupState> {
    try {
        const updates: { [key: string]: any } = {};
        updates['/cash_records'] = null; // Target the new unified path
        updates['/counters/cashRecordId'] = 0; // Reset the correct counter

        await update(ref(db), updates);

        revalidatePath('/cash-records'); // Revalidate the new page
        return { message: 'Successfully deleted all cash records and reset the ID counter.', error: false };
    } catch (e: any) {
        console.error("Error deleting cash records:", e);
        return { message: `An error occurred: ${e.message}`, error: true };
    }
}

export async function deleteBscSyncedRecords(): Promise<{ message: string; error: boolean }> {
    try {
        const [recordsSnapshot, apisSnapshot] = await Promise.all([
            get(ref(db, 'usdt_records')),
            get(ref(db, 'bsc_apis'))
        ]);


        const updates: { [key: string]: null | number } = {};
        let deletedCount = 0;

        if (recordsSnapshot.exists()) {
            recordsSnapshot.forEach(childSnapshot => {
                const record: UsdtRecord = childSnapshot.val();
                if (record.source === 'BSCScan') {
                    updates[`/usdt_records/${childSnapshot.key}`] = null;
                    deletedCount++;
                }
            });
        }
        
        // Reset all API config sync histories
        if (apisSnapshot.exists()) {
            apisSnapshot.forEach(childSnapshot => {
                updates[`/bsc_apis/${childSnapshot.key}/lastSyncedBlock`] = 0;
            });
        }
        
        updates['/counters/usdtRecordId'] = 0;

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/usdt-records');
        return { message: `Successfully deleted ${deletedCount} synced records and reset counters/sync history.`, error: false };
    } catch (e: any) {
        console.error("Error deleting synced records:", e);
        return { message: `An error occurred: ${e.message}`, error: true };
    }
}
