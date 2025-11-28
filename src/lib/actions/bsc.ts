
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, remove, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { logAction, getNextSequentialId } from './helpers';

export type BscApiFormState = {
  errors?: {
    name?: string[];
    accountId?: string[];
    walletAddress?: string[];
    apiKey?: string[];
  };
  message?: string;
  error?: boolean;
} | undefined;

const BscApiSettingSchema = z.object({
  name: z.string().min(1, { message: "Name is required." }),
  accountId: z.string().min(1, { message: "An account must be selected." }),
  walletAddress: z.string().startsWith('0x', { message: "Wallet address must start with 0x."}),
  apiKey: z.string().min(1, { message: "API key is required." }),
  lastSyncedBlock: z.coerce.number().optional(),
});

export async function createBscApiSetting(prevState: BscApiFormState, formData: FormData) {
    const validatedFields = BscApiSettingSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save setting.',
            error: true,
        };
    }
    
    try {
        const newId = await getNextSequentialId('bscApiId');
        
        await set(ref(db, `bsc_apis/BSC${newId}`), {
            ...validatedFields.data,
            id: `BSC${newId}`,
            createdAt: new Date().toISOString(),
            lastSyncedBlock: validatedFields.data.lastSyncedBlock || 0
        });

        revalidatePath('/settings/bsc-apis');
        return { message: 'BSC API setting saved successfully.' };
    } catch (e: any) {
        return { message: `Database error: ${e.message}`, error: true };
    }
}

export async function deleteBscApiSetting(id: string) {
     if (!id) {
        return { message: 'Invalid ID.', error: true };
    }
    try {
        await remove(ref(db, `bsc_apis/${id}`));
        revalidatePath('/settings/bsc-apis');
        return { message: 'Setting deleted.' };
    } catch (error) {
        return { message: 'Database error: Failed to delete setting.', error: true };
    }
}


export type MigrateState = { message?: string; error?: boolean; } | undefined;

export async function migrateExistingBscApi(prevState: MigrateState, formData: FormData): Promise<MigrateState> {
    try {
        const settingsSnapshot = await get(ref(db, 'settings/api'));
        if (!settingsSnapshot.exists()) {
            return { message: 'Old settings not found. Nothing to migrate.', error: true };
        }
        const oldSettings = settingsSnapshot.val();

        if (!oldSettings.bsc_api_key || !oldSettings.bsc_wallet_address) {
            return { message: 'No BSC API key or wallet address found in old settings.', error: true };
        }

        const bscApisRef = ref(db, 'bsc_apis');
        const bscApisSnapshot = await get(bscApisRef);
        if (bscApisSnapshot.exists() && bscApisSnapshot.hasChild('BSC1')) {
            return { message: 'A setting with the ID "BSC1" already exists. Migration skipped.', error: true };
        }

        const newSetting = {
            id: 'BSC1',
            name: 'Main Binance Wallet',
            accountId: '1003',
            walletAddress: oldSettings.bsc_wallet_address,
            apiKey: oldSettings.bsc_api_key,
            createdAt: new Date().toISOString(),
        };

        const updates: { [key: string]: any } = {};
        updates['/bsc_apis/BSC1'] = newSetting;
        updates['/settings/api/bsc_api_key'] = null;
        updates['/settings/api/bsc_wallet_address'] = null;

        await update(ref(db), updates);

        revalidatePath('/settings/bsc-apis');
        revalidatePath('/settings');
        return { message: 'Successfully migrated existing BSC API settings.' };

    } catch(e: any) {
         return { message: `Database error: ${e.message}`, error: true };
    }
}
