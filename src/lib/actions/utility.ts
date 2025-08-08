

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Transaction, BlacklistItem, FiatRate, CryptoFee, Settings, Currency } from '../types';
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
        // We use update here to not wipe other potential currencies if they exist
        const updates: { [key: string]: FiatRate } = {};
        const snapshot = await get(ref(db, 'settings/fiat_rates'));
        const existingRates: FiatRate[] = snapshot.val() || [];
        
        const finalRates = existingRates.filter(r => !currencies.includes(r.currency));
        finalRates.push(...rates);

        await set(ref(db, 'settings/fiat_rates'), finalRates);
        
        revalidatePath('/exchange-rates');
        return { success: true, message: 'Fiat rates updated successfully.' };
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
        await set(ref(db, 'settings/crypto_fees'), validatedFields.data);
        revalidatePath('/exchange-rates');
        return { success: true, message: 'Crypto fees updated successfully.' };
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
