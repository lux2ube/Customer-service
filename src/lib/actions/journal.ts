

'use server';

import { db } from '../firebase';
import { push, ref, set, get } from 'firebase/database';
import { stripUndefined, sendTelegramNotification } from './helpers';
import type { JournalEntry, Account } from '../types';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

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
                credit_account: ['Debit and credit accounts must be different.'],
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

export async function createJournalEntryFromTransaction(
    description: string,
    legs: { accountId: string; debit: number; credit: number; amount: number; currency: string }[],
    accountNames: Map<string, string>
) {
    if (legs.length < 2) {
        console.error("Journal entry must have at least two legs.");
        return [];
    }

    const totalDebits = legs.reduce((sum, leg) => sum + leg.debit, 0);
    const totalCredits = legs.reduce((sum, leg) => sum + leg.credit, 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
        console.error(`Journal entry is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
        return []; // Do not create unbalanced entries
    }

    if (Math.abs(totalDebits) < 0.01) {
        return []; // Don't create zero-value entries
    }
    
    const entries: Omit<JournalEntry, 'id'>[] = [];
    const date = new Date().toISOString();
    
    // We create a separate journal entry for each leg of the transaction for clarity
    const debitLegs = legs.filter(l => l.debit > 0);
    const creditLegs = legs.filter(l => l.credit > 0);
    
    // This is a simplified approach. A real system might pair them off or use a clearing account.
    // For now, we pair the first debit with the first credit, and so on.
    // This assumes a simple transaction structure.
    if(debitLegs.length === 1 && creditLegs.length === 1){
        const debitLeg = debitLegs[0];
        const creditLeg = creditLegs[0];
        
        entries.push({
            date,
            description,
            debit_account: debitLeg.accountId,
            credit_account: creditLeg.accountId,
            debit_amount: debitLeg.amount,
            credit_amount: creditLeg.amount,
            amount_usd: totalDebits, // The total value of the entry
            createdAt: date,
            debit_account_name: accountNames.get(debitLeg.accountId),
            credit_account_name: accountNames.get(creditLeg.accountId),
            details: legs,
        });
    } else {
        // Fallback for more complex entries: just log the legs.
        // This part needs a more robust accounting design for multi-leg entries (e.g., using a suspense account).
        // For now, we'll create a simplified entry.
         const firstDebitLeg = legs.find(l => l.debit > 0)!;
         const firstCreditLeg = legs.find(l => l.credit > 0)!;
         entries.push({
            date,
            description,
            debit_account: firstDebitLeg.accountId,
            credit_account: firstCreditLeg.accountId,
            debit_amount: totalDebits,
            credit_amount: totalCredits,
            amount_usd: totalDebits,
            createdAt: date,
            debit_account_name: accountNames.get(firstDebitLeg.accountId),
            credit_account_name: accountNames.get(firstCreditLeg.accountId),
            details: legs,
        });
    }

    return entries;
}
