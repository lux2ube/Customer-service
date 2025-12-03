

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Account } from '../types';
import { stripUndefined, logAction } from './helpers';
import { redirect } from 'next/navigation';

// --- Chart of Accounts Actions ---

export type AccountFormState =
  | {
      errors?: {
        id?: string[];
        name?: string[];
        type?: string[];
        currency?: string[];
      };
      message?: string;
    }
  | undefined;

const AccountSchema = z.object({
  id: z.string().regex(/^[0-9]+$/, { message: "Account code must be numeric." }),
  name: z.string().min(1, { message: "Account name is required." }),
  type: z.enum(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses']),
  isGroup: z.boolean().default(false),
  parentId: z.string().optional().nullable(),
  currency: z.string().optional().nullable(), // Will be validated against currency list
});


export async function createAccount(accountId: string | null, prevState: AccountFormState, formData: FormData): Promise<AccountFormState> {
    const parentIdValue = formData.get('parentId');
    const currencyValue = formData.get('currency');

    const rawData = {
        id: accountId ?? formData.get('id'),
        name: formData.get('name'),
        type: formData.get('type'),
        isGroup: formData.get('isGroup') === 'on',
        parentId: parentIdValue === 'none' ? null : parentIdValue,
        currency: currencyValue === 'none' ? null : currencyValue,
    };

    const validatedFields = AccountSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save account. Please check the fields.',
        };
    }

    const { id, ...data } = validatedFields.data;

    if (!id) {
        return {
            errors: { id: ["Account code is required."] },
            message: 'Failed to save account.',
        };
    }

    const dataForFirebase = stripUndefined(data);
    const isEditing = !!accountId;
    let oldData = null;

    try {
        const accountRef = ref(db, `accounts/${id}`);
        if(isEditing) {
             const snapshot = await get(accountRef);
             oldData = snapshot.val();
             await update(accountRef, dataForFirebase);
        } else {
            const accountsSnapshot = await get(ref(db, 'accounts'));
            const count = accountsSnapshot.exists() ? accountsSnapshot.size : 0;
            const newAccountRef = ref(db, `accounts/${id}`)
            await set(newAccountRef, {
                ...dataForFirebase,
                priority: count,
                balance: 0, // Initialize balance to 0 for new accounts
                lastBalanceUpdate: new Date().toISOString(),
            });
        }
        
        // Logging
        await logAction(
            isEditing ? 'update_account' : 'create_account',
            { type: 'account', id: id, name: data.name },
            { new: dataForFirebase, old: oldData }
        );

    } catch (error) {
        return { message: 'Database Error: Failed to save account.' }
    }
    
    revalidatePath('/accounting/chart-of-accounts');
    revalidatePath('/logs');
    redirect('/accounting/chart-of-accounts');
}

/**
 * Fix accounts 7001 (unmatched cash) and 7002 (unmatched USDT) to be posting accounts
 */
export async function fixAccount7000() {
    try {
        // Fix/create 7001 (Unmatched Cash)
        const account7001Ref = ref(db, 'accounts/7001');
        const snapshot7001 = await get(account7001Ref);
        
        if (!snapshot7001.exists()) {
            await set(account7001Ref, {
                id: '7001',
                name: 'Unmatched Cash',
                type: 'Liabilities',
                isGroup: false,
                currency: 'USD',
                createdAt: new Date().toISOString(),
                priority: 0,
                balance: 0,
                lastBalanceUpdate: new Date().toISOString()
            });
            console.log('✅ Created account 7001 (Unmatched Cash)');
        } else {
            await update(account7001Ref, {
                name: 'Unmatched Cash',
                isGroup: false,
                currency: 'USD'
            });
            console.log('✅ Fixed account 7001');
        }

        // Fix/create 7002 (Unmatched USDT)
        const account7002Ref = ref(db, 'accounts/7002');
        const snapshot7002 = await get(account7002Ref);
        
        if (!snapshot7002.exists()) {
            await set(account7002Ref, {
                id: '7002',
                name: 'Unmatched USDT',
                type: 'Liabilities',
                isGroup: false,
                currency: 'USDT',
                createdAt: new Date().toISOString(),
                priority: 1,
                balance: 0,
                lastBalanceUpdate: new Date().toISOString()
            });
            console.log('✅ Created account 7002 (Unmatched USDT)');
        } else {
            await update(account7002Ref, {
                name: 'Unmatched USDT',
                isGroup: false,
                currency: 'USDT'
            });
            console.log('✅ Fixed account 7002');
        }

        revalidatePath('/accounting/chart-of-accounts');
        revalidatePath('/');
        return { success: true, message: 'Accounts 7001 & 7002 fixed - now accepting transactions' };
    } catch (error) {
        console.error('Error fixing accounts:', error);
        return { success: false, message: 'Failed to fix accounts' };
    }
}

export async function deleteAccount(accountId: string) {
    if (!accountId) {
        return { message: 'Invalid account ID.' };
    }
    try {
        const accountRef = ref(db, `accounts/${accountId}`);
        const snapshot = await get(accountRef);
        if (!snapshot.exists()) {
             return { message: 'Account not found.' };
        }
        const accountData = snapshot.val();
        await remove(accountRef);

        await logAction(
            'delete_account',
            { type: 'account', id: accountId, name: accountData.name },
            { deletedData: accountData }
        );

        revalidatePath('/accounting/chart-of-accounts');
        revalidatePath('/logs');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete account.' };
    }
}

export async function updateAccountPriority(accountId: string, parentId: string | null, direction: 'up' | 'down') {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (!snapshot.exists()) return;

    const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
    
    const siblingAccounts = allAccounts.filter(acc => (acc.parentId || null) === (parentId || null));

    let maxPriority = -1;
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority === 'number' && acc.priority > maxPriority) {
        maxPriority = acc.priority;
      }
    });
    
    const updates: { [key: string]: any } = {};
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority !== 'number') {
        maxPriority++;
        acc.priority = maxPriority;
        updates[`/accounts/${acc.id}/priority`] = acc.priority;
      }
    });

    if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
    }
    
    siblingAccounts.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));

    const currentIndex = siblingAccounts.findIndex(acc => acc.id === accountId);
    if (currentIndex === -1) return;

    let otherIndex = -1;
    if (direction === 'up' && currentIndex > 0) {
        otherIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < siblingAccounts.length - 1) {
        otherIndex = currentIndex + 1;
    }
    
    if (otherIndex !== -1) {
        const currentAccount = siblingAccounts[currentIndex];
        const otherAccount = siblingAccounts[otherIndex];
        
        const priorityUpdates: { [key: string]: any } = {};
        priorityUpdates[`/accounts/${currentAccount.id}/priority`] = otherAccount.priority;
        priorityUpdates[`/accounts/${otherAccount.id}/priority`] = currentAccount.priority;
        
        try {
            await update(ref(db), priorityUpdates);
             await logAction(
                'update_account_priority',
                { type: 'account', id: accountId, name: currentAccount.name },
                { direction, newPriority: otherAccount.priority }
            );
        } catch (error) {
            console.error("Failed to update priority:", error);
        }
    }
    
    revalidatePath('/accounting/chart-of-accounts');
}


export type SetupState = { message?: string; error?: boolean; } | undefined;

export async function setupClientParentAccount(prevState: SetupState, formData: FormData): Promise<SetupState> {
    try {
        const accountsRef = ref(db, 'accounts');
        const accountsSnapshot = await get(accountsRef);
        const allAccounts = accountsSnapshot.val() || {};
        
        const updates: { [key: string]: any } = {};
        
        // 1. Create the parent account if it doesn't exist
        if (!allAccounts['6000']) {
            updates['/accounts/6000'] = {
                name: 'Clients',
                type: 'Liabilities',
                isGroup: true,
                currency: 'USD',
                priority: 99, // High priority to appear at the top
            };
        } else {
             // Ensure it is a group account
            updates['/accounts/6000/isGroup'] = true;
            updates['/accounts/6000/type'] = 'Liabilities';
        }

        // 2. Find all client sub-accounts and set their parentId
        let updatedCount = 0;
        for (const accountId in allAccounts) {
            // A client sub-account is assumed to start with '600', is not a group, and is not the parent itself.
            if (accountId.startsWith('600') && accountId !== '6000' && !allAccounts[accountId].isGroup) {
                 if (allAccounts[accountId].parentId !== '6000') {
                    updates[`/accounts/${accountId}/parentId`] = '6000';
                    updatedCount++;
                }
            }
        }
        
        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/accounting/chart-of-accounts');
        
        let message = "Parent account '6000 - Clients' ensured. ";
        message += `Updated ${updatedCount} client sub-accounts to be nested correctly.`
        
        return { message, error: false };

    } catch (e: any) {
        console.error("Client parent account setup error:", e);
        return { message: e.message || 'An unknown error occurred during setup.', error: true };
    }
}
