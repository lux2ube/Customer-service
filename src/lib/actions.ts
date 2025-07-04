'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './firebase';
import { ref, set, push } from 'firebase/database';

export type FormState = {
    message: string;
    errors?: z.ZodError['formErrors']['fieldErrors'];
} | undefined;

const JournalEntrySchema = z.object({
  date: z.string().min(1, 'Date is required.'),
  description: z.string().min(1, 'Description is required.'),
  debit_account: z.string().min(1, 'Debit account is required.'),
  credit_account: z.string().min(1, 'Credit account is required.'),
  amount: z.coerce.number().gt(0, 'Amount must be positive.'),
  currency: z.enum(['YER', 'USD', 'SAR', 'USDT']),
  // Fields for later implementation
  // exchange_rate: z.coerce.number().optional(),
  // usd_value: z.coerce.number().optional(),
  // fee_usd: z.coerce.number().optional(),
  // usdt_amount: z.coerce.number().optional(),
  // status: z.enum(['pending', 'confirmed', 'cancelled']),
  // flag: z.string().optional(),
  // hash: z.string().optional(),
  // wallet_address: z.string().optional(),
  // attachment_url: z.string().optional(),
  // added_by: z.string().optional(),
});


export async function createJournalEntry(prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = JournalEntrySchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        console.log(validatedFields.error.flatten().fieldErrors);
        return {
            message: 'Failed to create journal entry. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    try {
        const journalRef = ref(db, 'journal_entries');
        const newEntryRef = push(journalRef);
        await set(newEntryRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(), // Internal timestamp
            status: 'confirmed', // Default status
        });
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save entry.';
        return { message: `Database Error: ${errorMessage}` };
    }
    
    revalidatePath('/accounting/journal');
    redirect('/accounting/journal');
}
