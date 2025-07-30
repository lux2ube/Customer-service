
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Transaction, BlacklistItem, TransactionFlag } from '../types';

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


// --- Label Actions ---
export type LabelFormState = { message?: string } | undefined;

const LabelSchema = z.object({
  name: z.string().min(1, { message: "Label name is required." }),
  color: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, { message: "Must be a valid hex color code." }),
});

export async function createLabel(formData: FormData): Promise<LabelFormState> {
    const rawData = {
        name: formData.get('name'),
        color: formData.get('color-text') || formData.get('color'),
    };
    const validatedFields = LabelSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.name?.[0] || 'Invalid data.' };
    }

    try {
        const newRef = push(ref(db, 'labels'));
        await set(newRef, {
            ...validatedFields.data,
            id: newRef.key,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/labels');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to save label.' };
    }
}

export async function deleteLabel(id: string): Promise<LabelFormState> {
    if (!id) return { message: 'Invalid ID.' };
    try {
        await remove(ref(db, `labels/${id}`));
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);
        if (clientsSnapshot.exists()) {
            const updates: { [key: string]: any } = {};
            clientsSnapshot.forEach(childSnapshot => {
                const client = childSnapshot.val() as Client;
                if (client.review_flags?.includes(id)) {
                    const newFlags = client.review_flags.filter(flagId => flagId !== id);
                    updates[`/clients/${childSnapshot.key}/review_flags`] = newFlags;
                }
            });
            if(Object.keys(updates).length > 0) await update(ref(db), updates);
        }

        const transactionsRef = ref(db, 'transactions');
        const transactionsSnapshot = await get(transactionsRef);
        if (transactionsSnapshot.exists()) {
            const updates: { [key: string]: any } = {};
            transactionsSnapshot.forEach(childSnapshot => {
                const tx = childSnapshot.val() as Transaction;
                if (tx.flags?.includes(id)) {
                    const newFlags = tx.flags.filter(flagId => flagId !== id);
                    updates[`/transactions/${childSnapshot.key}/flags`] = newFlags;
                }
            });
            if(Object.keys(updates).length > 0) await update(ref(db), updates);
        }

        revalidatePath('/labels');
        revalidatePath('/clients');
        revalidatePath('/transactions');
        return {};
    } catch (error) {
        console.error(error);
        return { message: 'Database error: Failed to delete label.' };
    }
}
