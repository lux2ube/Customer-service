
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';

export type ParsingRuleFormState = {
  errors?: {
    name?: string[];
    type?: string[];
    amountStartsAfter?: string[];
    amountEndsBefore?: string[];
    personStartsAfter?: string[];
    personEndsBefore?: string[];
  };
  message?: string;
} | undefined;


const SmsParsingRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required.'),
  type: z.enum(['credit', 'debit']),
  amountStartsAfter: z.string().min(1, 'This marker is required.'),
  amountEndsBefore: z.string().min(1, 'This marker is required.'),
  personStartsAfter: z.string().min(1, 'This marker is required.'),
  personEndsBefore: z.string().optional(), // This one is optional
});


export async function createSmsParsingRule(prevState: ParsingRuleFormState, formData: FormData): Promise<ParsingRuleFormState> {
    const validatedFields = SmsParsingRuleSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save rule. Please check the fields.',
        };
    }
    
    try {
        const newRuleRef = push(ref(db, 'sms_parsing_rules'));
        await set(newRuleRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to save parsing rule.' };
    }
}

export async function deleteSmsParsingRule(id: string): Promise<{ message?: string }> {
    if (!id) {
        return { message: 'Invalid rule ID.' };
    }
    try {
        await remove(ref(db, `sms_parsing_rules/${id}`));
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to delete rule.' };
    }
}
