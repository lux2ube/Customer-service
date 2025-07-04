'use server';

import { z } from 'zod';
import { db } from './firebase';
import { push, ref, set } from 'firebase/database';
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