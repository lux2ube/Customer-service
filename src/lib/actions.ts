
'use server';

import { z } from 'zod';
import { db } from './firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export type FormState =
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


export async function createJournalEntry(prevState: FormState, formData: FormData) {
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
    name: z.string().min(1, { message: 'Account name is required.' }),
    account_number: z.string().optional(),
    currency: z.enum(['USD', 'YER', 'SAR']),
    status: z.enum(['Active', 'Inactive']),
});

export async function createBankAccount(accountId: string | null, prevState: BankAccountFormState, formData: FormData) {
    const validatedFields = BankAccountSchema.safeParse({
        name: formData.get('name'),
        account_number: formData.get('account_number'),
        currency: formData.get('currency'),
        status: formData.get('status'),
    });

     if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save bank account. Please check the fields.',
        };
    }

    try {
        if (accountId) {
             const accountRef = ref(db, `bank_accounts/${accountId}`);
             const snapshot = await get(accountRef);
             const existingData = snapshot.val();
             await update(accountRef, { ...existingData, ...validatedFields.data });
        } else {
            const newAccountRef = push(ref(db, 'bank_accounts'));
            await set(newAccountRef, {
                ...validatedFields.data,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        return { message: 'Database Error: Failed to save bank account.' }
    }
    
    revalidatePath('/bank-accounts');
    redirect('/bank-accounts');
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
    flags: z.string().optional(),
});


export async function createTransaction(transactionId: string | null, prevState: TransactionFormState, formData: FormData) {
    const validatedFields = TransactionSchema.safeParse(Object.fromEntries(formData.entries()));
    
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }

    try {
        if (transactionId) {
            const transactionRef = ref(db, `transactions/${transactionId}`);
            const snapshot = await get(transactionRef);
            const existingData = snapshot.val();
            await update(transactionRef, { ...existingData, ...validatedFields.data });
        } else {
            const newTransactionRef = push(ref(db, 'transactions'));
            await set(newTransactionRef, {
                ...validatedFields.data,
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
