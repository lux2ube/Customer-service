
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Account, BankAccount } from '../types';
import { stripUndefined, logAction, sendTelegramNotification } from './helpers';
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
  currency: z.enum(['USD', 'YER', 'SAR', 'USDT', 'none']).optional().nullable(),
});

async function ensureDefaultAccounts() {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    const existingAccounts = snapshot.val() || {};
    const updates: { [key: string]: any } = {};

    const defaultAccounts: Omit<Account, 'id'>[] = [
        { name: 'Crypto Transaction Fees', type: 'Income', isGroup: false, parentId: '4000', currency: 'USD', id: '4001' },
        { name: 'Exchange Rate Commission', type: 'Income', isGroup: false, parentId: '4000', currency: 'USD', id: '4002' },
        { name: 'Discounts & Expenses', type: 'Expenses', isGroup: false, parentId: '5000', currency: 'USD', id: '5001' },
    ];
    
    let priority = snapshot.exists() ? snapshot.size : 0;
    
    for (const acc of defaultAccounts) {
        const accountId = acc.id!;
         if (!existingAccounts[accountId]) {
            updates[`/accounts/${accountId}`] = { ...acc, priority };
            priority++;
        }
    }

    if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        console.log("Default profit/expense accounts ensured in Chart of Accounts.");
    }
}

export async function createAccount(accountId: string | null, formData: FormData) {
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
        await ensureDefaultAccounts();
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
    
    siblingAccounts.sort((a, b) => a.priority! - b.priority!);

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


// --- Bank Account Actions ---
export type BankAccountFormState =
| {
    errors?: {
        name?: string[];
        account_number?: string[];
        currency?: string[];
        status?: string[];
    };
    message?: string;
    }
| undefined;

const BankAccountSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    account_number: z.string().optional(),
    currency: z.enum(['USD', 'YER', 'SAR']),
    status: z.enum(['Active', 'Inactive']),
});

export async function createBankAccount(accountId: string | null, formData: FormData) {
    const validatedFields = BankAccountSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save bank account. Please check the fields.',
        };
    }

    const data = validatedFields.data;
    const dataForFirebase = stripUndefined(data);
    const isEditing = !!accountId;
    let finalId = accountId;

    try {
        if (isEditing) {
            const accountRef = ref(db, `bank_accounts/${accountId}`);
            await update(accountRef, dataForFirebase);
        } else {
            const newAccountRef = push(ref(db, 'bank_accounts'));
            finalId = newAccountRef.key;
            const snapshot = await get(ref(db, 'bank_accounts'));
            const count = snapshot.exists() ? snapshot.size : 0;
            
            await set(newAccountRef, {
                ...dataForFirebase,
                priority: count,
                createdAt: new Date().toISOString(),
            });
        }
        
        await logAction(
            isEditing ? 'update_bank_account' : 'create_bank_account',
            { type: 'bank_account', id: finalId!, name: data.name },
            dataForFirebase
        );

    } catch (error) {
        return { message: 'Database Error: Failed to save bank account.' }
    }
    
    revalidatePath('/bank-accounts');
    revalidatePath('/logs');
    redirect('/bank-accounts');
}

export async function updateBankAccountPriority(accountId: string, direction: 'up' | 'down') {
    const accountsRef = ref(db, 'bank_accounts');
    const snapshot = await get(accountsRef);
    if (!snapshot.exists()) return;

    let accounts: BankAccount[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));

    accounts.forEach((acc, index) => {
        if (acc.priority === undefined || acc.priority === null) {
            acc.priority = index;
        }
    });

    accounts.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const currentIndex = accounts.findIndex(acc => acc.id === accountId);
    if (currentIndex === -1) return;

    let otherIndex = -1;
    if (direction === 'up' && currentIndex > 0) {
        otherIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < accounts.length - 1) {
        otherIndex = currentIndex + 1;
    }
    
    if (otherIndex !== -1) {
        const currentAccount = accounts[currentIndex];
        const otherAccount = accounts[otherIndex];
        
        const updates: { [key: string]: any } = {};
        updates[`/bank_accounts/${currentAccount.id}/priority`] = otherAccount.priority;
        updates[`/bank_accounts/${otherAccount.id}/priority`] = currentAccount.priority;
        
        try {
            await update(ref(db), updates);
            await logAction(
                'update_bank_account_priority',
                { type: 'bank_account', id: accountId, name: currentAccount.name },
                { direction, newPriority: otherAccount.priority }
            );
        } catch (error) {
            console.error("Failed to update priority:", error);
        }
    }
    
    revalidatePath('/bank-accounts');
}

export type JournalEntryFormState =
  | {
      errors?: {
        date?: string[];
        description?: string[];
        debit_account?: string[];
        credit_account?: string[];
        debit_amount?: string[];
        credit_amount?: string[];
      };
      message?: string;
    }
  | undefined;


const JournalEntrySchema = z.object({
    date: z.string({ invalid_type_error: 'Please select a date.' }),
    description: z.string().min(1, { message: 'Description is required.' }),
    debit_account: z.string().min(1, { message: 'Please select a debit account.' }),
    credit_account: z.string().min(1, { message: 'Please select a credit account.' }),
    debit_amount: z.coerce.number().gt(0, { message: 'Debit amount must be positive.' }),
    credit_amount: z.coerce.number().gt(0, { message: 'Credit amount must be positive.' }),
    amount_usd: z.coerce.number().gt(0, { message: 'USD amount must be positive.' }),
});


export async function createJournalEntry(prevState: JournalEntryFormState, formData: FormData) {
    const validatedFields = JournalEntrySchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create journal entry. Please check the fields.',
        };
    }

    const { date, description, debit_account, credit_account, debit_amount, credit_amount, amount_usd } = validatedFields.data;

    if (debit_account === credit_account) {
        return {
            errors: {
                debit_account: ['Debit and credit accounts cannot be the same.'],
                credit_account: ['Debit and credit accounts must be the same.'],
            },
            message: 'Debit and credit accounts must be different.'
        }
    }

    // Denormalize account names
    let debit_account_name = '';
    let credit_account_name = '';
    try {
        const debitSnapshot = await get(ref(db, `accounts/${debit_account}`));
        if (debitSnapshot.exists()) debit_account_name = (debitSnapshot.val() as Account).name;
        const creditSnapshot = await get(ref(db, `accounts/${credit_account}`));
        if (creditSnapshot.exists()) credit_account_name = (creditSnapshot.val() as Account).name;
    } catch(e) { console.error("Could not fetch account names for journal entry"); }


    try {
        const newEntryRef = push(ref(db, 'journal_entries'));
        await set(newEntryRef, {
            date,
            description,
            debit_account,
            credit_account,
            debit_amount,
            credit_amount,
            amount_usd,
            debit_account_name,
            credit_account_name,
            createdAt: new Date().toISOString(),
        });
        
        // Telegram Notification for Journal Entry
        const notificationMessage = `
*🔄 Journal Entry Created*
*Description:* ${description}
*Amount:* ${amount_usd.toFixed(2)} USD
*From (Debit):* ${debit_account_name}
*To (Credit):* ${credit_account_name}
        `;
        await sendTelegramNotification(notificationMessage);

    } catch (error) {
        return {
            message: 'Database Error: Failed to create journal entry.'
        }
    }
    
    revalidatePath('/accounting/journal');
    redirect('/accounting/journal');
}
