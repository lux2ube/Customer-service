
'use server';

import { z } from 'zod';
import { db } from './firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Client, Account } from './types';

export type JournalEntryFormState =
  | {
      errors?: {
        date?: string[];
        description?: string[];
        debit_account?: string[];
        credit_account?: string[];
        amount?: string[];
        currency?: string[];
      };
      message?: string;
    }
  | undefined;


const JournalEntrySchema = z.object({
    date: z.string({ invalid_type_error: 'Please select a date.' }),
    description: z.string().min(1, { message: 'Description is required.' }),
    debit_account: z.string().min(1, { message: 'Please select a debit account.' }),
    credit_account: z.string().min(1, { message: 'Please select a credit account.' }),
    amount: z.coerce.number().gt(0, { message: 'Amount must be greater than 0.' }),
    currency: z.enum(['USD', 'YER', 'SAR', 'USDT']),
});


export async function createJournalEntry(prevState: JournalEntryFormState, formData: FormData) {
    const validatedFields = JournalEntrySchema.safeParse({
        date: formData.get('date'),
        description: formData.get('description'),
        debit_account: formData.get('debit_account'),
        credit_account: formData.get('credit_account'),
        amount: formData.get('amount'),
        currency: formData.get('currency'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create journal entry. Please check the fields.',
        };
    }

    const { date, description, debit_account, credit_account, amount, currency } = validatedFields.data;

    if (debit_account === credit_account) {
        return {
            errors: {
                debit_account: ['Debit and credit accounts cannot be the same.'],
                credit_account: ['Debit and credit accounts cannot be the same.'],
            },
            message: 'Debit and credit accounts must be different.'
        }
    }

    try {
        const newEntryRef = push(ref(db, 'journal_entries'));
        await set(newEntryRef, {
            date,
            description,
            debit_account,
            credit_account,
            amount,
            currency,
            createdAt: new Date().toISOString(),
        });
    } catch (error) {
        return {
            message: 'Database Error: Failed to create journal entry.'
        }
    }
    
    revalidatePath('/accounting/journal');
    redirect('/accounting/journal');
}


// --- Client Actions ---
export type ClientFormState =
  | {
      errors?: {
        name?: string[];
        phone?: string[];
        verification_status?: string[];
      };
      message?: string;
    }
  | undefined;

const ClientSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    phone: z.string().min(1, { message: 'Phone is required.' }),
    kyc_type: z.enum(['ID', 'Passport']).optional(),
    kyc_document_url: z.string().optional(),
    verification_status: z.enum(['Active', 'Inactive', 'Pending']),
    review_flags: z.array(z.string()).optional(),
});

export async function createClient(clientId: string | null, prevState: ClientFormState, formData: FormData) {
    const validatedFields = ClientSchema.safeParse({
        name: formData.get('name'),
        phone: formData.get('phone'),
        kyc_type: formData.get('kyc_type'),
        verification_status: formData.get('verification_status'),
        review_flags: formData.getAll('review_flags'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save client. Please check the fields.',
        };
    }

    try {
        if (clientId) {
            const clientRef = ref(db, `clients/${clientId}`);
            const snapshot = await get(clientRef);
            const existingData = snapshot.val();
            await update(clientRef, { ...existingData, ...validatedFields.data });
        } else {
            const newClientRef = push(ref(db, 'clients'));
            await set(newClientRef, {
                ...validatedFields.data,
                createdAt: new Date().toISOString()
            });
        }
    } catch (error) {
        return { message: 'Database Error: Failed to save client.' }
    }
    
    revalidatePath('/clients');
    redirect('/clients');
}

// --- Transaction Actions ---
export type TransactionFormState =
  | {
      errors?: {
        date?: string[];
        clientId?: string[];
        type?: string[];
        amount?: string[];
        currency?: string[];
      };
      message?: string;
    }
  | undefined;

const TransactionSchema = z.object({
    date: z.string({ invalid_type_error: 'Please select a date.' }),
    clientId: z.string().min(1, { message: 'Please select a client.' }),
    type: z.enum(['Deposit', 'Withdraw']),
    amount: z.coerce.number().gt(0, { message: 'Amount must be greater than 0.' }),
    currency: z.enum(['USD', 'YER', 'SAR', 'USDT']),
    bankAccountId: z.string().optional(),
    cryptoWalletId: z.string().optional(),
    amount_usd: z.coerce.number(),
    fee_usd: z.coerce.number(),
    amount_usdt: z.coerce.number(),
    attachment_url: z.string().optional(),
    notes: z.string().optional(),
    remittance_number: z.string().optional(),
    hash: z.string().optional(),
    client_wallet_address: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
    flags: z.string().optional().transform(v => v ? [v] : []), // Store as array
});


export async function createTransaction(transactionId: string | null, prevState: TransactionFormState, formData: FormData) {
    const rawData = Object.fromEntries(formData.entries());
    const validatedFields = TransactionSchema.safeParse(rawData);
    
    if (!validatedFields.success) {
        console.log(validatedFields.error.flatten().fieldErrors);
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }

    // Get Client Name for denormalization
    let clientName = '';
    try {
        const clientRef = ref(db, `clients/${validatedFields.data.clientId}`);
        const snapshot = await get(clientRef);
        if (snapshot.exists()) {
            clientName = (snapshot.val() as Client).name;
        }
    } catch (e) {
        console.error("Could not fetch client name for transaction");
    }

    // Get Bank Account Name for denormalization
    let bankAccountName = '';
    if (validatedFields.data.bankAccountId) {
        try {
            const bankAccountRef = ref(db, `accounts/${validatedFields.data.bankAccountId}`);
            const snapshot = await get(bankAccountRef);
            if (snapshot.exists()) {
                bankAccountName = (snapshot.val() as Account).name;
            }
        } catch (e) {
            console.error("Could not fetch bank account name for transaction");
        }
    }


    const dataToSave = {
        ...validatedFields.data,
        clientName, // Add client name to the record
        bankAccountName, // Add bank account name to the record
    };

    try {
        if (transactionId) {
            const transactionRef = ref(db, `transactions/${transactionId}`);
            const snapshot = await get(transactionRef);
            const existingData = snapshot.val();
            await update(transactionRef, { ...existingData, ...dataToSave });
        } else {
            const newTransactionRef = push(ref(db, 'transactions'));
            await set(newTransactionRef, {
                ...dataToSave,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        console.log(error);
        return {
            message: 'Database Error: Failed to create transaction.'
        }
    }
    
    revalidatePath('/transactions');
    redirect('/transactions');
}

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
  currency: z.enum(['USD', 'YER', 'SAR', 'USDT']).optional().nullable(),
});

export async function createAccount(accountId: string | null, prevState: AccountFormState, formData: FormData) {
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

    try {
        const accountRef = ref(db, `accounts/${id}`);
        await set(accountRef, data);
    } catch (error) {
        return { message: 'Database Error: Failed to save account.' }
    }
    
    revalidatePath('/accounting/chart-of-accounts');
    redirect('/accounting/chart-of-accounts');
}

export async function deleteAccount(accountId: string) {
    if (!accountId) {
        return { message: 'Invalid account ID.' };
    }
    try {
        const accountRef = ref(db, `accounts/${accountId}`);
        await remove(accountRef);
        revalidatePath('/accounting/chart-of-accounts');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete account.' };
    }
}
