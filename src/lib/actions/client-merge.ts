
'use server';

import { db } from '../firebase';
import { ref, update, get } from 'firebase/database';
import type { Client, Transaction, CashRecord, UsdtRecord } from '../types';
import { revalidatePath } from 'next/cache';
import { logAction } from './helpers';

export type MergeState = {
  message?: string;
  error?: boolean;
  success?: boolean;
} | undefined;


export async function mergeDuplicateClients(prevState: MergeState, formData: FormData): Promise<MergeState> {
    try {
        const clientsSnapshot = await get(ref(db, 'clients'));
        if (!clientsSnapshot.exists()) {
            return { message: "No clients found to merge.", error: false };
        }

        const allClients: Record<string, Client> = clientsSnapshot.val();
        const clientsByName: Record<string, Client[]> = {};

        for (const clientId in allClients) {
            const client = { id: clientId, ...allClients[clientId] };
            if (!client.name) continue;
            const normalizedName = client.name.trim().toLowerCase();
            if (!clientsByName[normalizedName]) {
                clientsByName[normalizedName] = [];
            }
            clientsByName[normalizedName].push(client);
        }

        const duplicateGroups = Object.values(clientsByName).filter(group => group.length > 1);

        if (duplicateGroups.length === 0) {
            return { message: "No duplicate clients found to merge.", success: true };
        }

        const updates: { [key: string]: any } = {};
        let mergedCount = 0;

        for (const group of duplicateGroups) {
            group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            const primaryClient = group[0];
            const duplicates = group.slice(1);

            for (const duplicateClient of duplicates) {
                // Reassign records
                const pathsToUpdate = ['transactions', 'cash_records', 'modern_usdt_records'];
                for (const path of pathsToUpdate) {
                    const recordsSnapshot = await get(ref(db, path));
                    if (recordsSnapshot.exists()) {
                        const records = recordsSnapshot.val();
                        for (const recordId in records) {
                            if (records[recordId].clientId === duplicateClient.id) {
                                updates[`/${path}/${recordId}/clientId`] = primaryClient.id;
                                updates[`/${path}/${recordId}/clientName`] = primaryClient.name;
                            }
                        }
                    }
                }
                // Mark duplicate for deletion
                updates[`/clients/${duplicateClient.id}`] = null;
                mergedCount++;

                 await logAction(
                    'merge_client',
                    { type: 'client', id: primaryClient.id, name: primaryClient.name },
                    { mergedFromId: duplicateClient.id, mergedFromName: duplicateClient.name }
                );
            }
        }
        
        await update(ref(db), updates);

        revalidatePath('/clients');
        revalidatePath('/transactions');
        revalidatePath('/modern-cash-records');
        revalidatePath('/modern-usdt-records');

        return { message: `Successfully merged ${mergedCount} duplicate client records.`, success: true };

    } catch (e: any) {
        console.error("Client Merge Error:", e);
        return { message: e.message || "An unknown error occurred during the merge.", error: true };
    }
}
