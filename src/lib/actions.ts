'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './firebase';
import { ref, set, push, remove, get } from 'firebase/database';

const ClientSchema = z.object({
    name: z.string({ required_error: "Name is required." }).min(2, 'Name must be at least 2 characters.'),
    phone: z.string().min(1, 'Phone number is required.'),
    verificationStatus: z.enum(['Active', 'Inactive']),
    aml: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
    volume: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
    scam: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
});

export type FormState = {
    message: string;
    errors?: z.ZodError['formErrors']['fieldErrors'];
} | undefined

export async function saveClient(id: string | null, prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = ClientSchema.safeParse({
        name: formData.get('name'),
        phone: formData.get('phone'),
        verificationStatus: formData.get('verificationStatus'),
        aml: formData.get('aml'),
        volume: formData.get('volume'),
        scam: formData.get('scam'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to save client. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const { name, phone, verificationStatus, ...flags } = validatedFields.data;
    const clientData = {
        name,
        phone,
        verificationStatus,
        reviewFlags: flags,
    };
    let clientId = id;
    
    try {
        if (clientId) {
            // Update existing client
            const clientRef = ref(db, `users/${clientId}`);
            const snapshot = await get(clientRef);
            const existingClient = snapshot.val() || {};
            await set(clientRef, {
                ...existingClient,
                ...clientData,
            });
        } else {
            // Create new client
            const usersRef = ref(db, 'users');
            const newClientRef = push(usersRef);
            await set(newClientRef, { 
                ...clientData, 
                created_at: new Date().toISOString(),
                avatarUrl: `https://placehold.co/100x100.png?text=${clientData.name.charAt(0)}`
            });
            clientId = newClientRef.key;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save client.';
        return { message: `Database Error: ${errorMessage}` };
    }

    revalidatePath('/clients');
    revalidatePath('/');
    if (clientId) {
       revalidatePath(`/clients/${clientId}`);
       redirect(`/clients/${clientId}`);
    } else {
        redirect('/clients');
    }
}


export async function deleteClientAction(id: string) {
    if (!id) {
        console.error("Delete action called without an ID.");
        return;
    }
    try {
        const clientRef = ref(db, `users/${id}`);
        await remove(clientRef);
        revalidatePath('/clients');
        revalidatePath('/');
    } catch (e) {
        console.error('Failed to delete client:', e);
    }
    redirect('/clients');
}

const BankAccountSchema = z.object({
    name: z.string().min(1, 'Account name is required.'),
    currency: z.enum(['YER', 'SAR', 'USD'], { required_error: 'Currency is required.'}),
});

export async function saveBankAccount(id: string | null, prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = BankAccountSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            message: 'Failed to save bank account.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const accountData = validatedFields.data;
    let accountId = id;
    
    try {
        if (accountId) {
            // Update existing
            const accountRef = ref(db, `bank_accounts/${accountId}`);
            await set(accountRef, accountData);
        } else {
            // Create new
            const accountsRef = ref(db, 'bank_accounts');
            const newAccountRef = push(accountsRef);
            await set(newAccountRef, { 
                ...accountData, 
                createdAt: new Date().toISOString(),
            });
            accountId = newAccountRef.key;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Database error.';
        return { message: `Error: ${errorMessage}` };
    }

    revalidatePath('/bank-accounts');
    revalidatePath('/transactions/new');
    return { message: `Successfully ${id ? 'updated' : 'added'} bank account.` };
}

export async function deleteBankAccountAction(id: string) {
    if (!id) {
        console.error("Delete action called without an ID.");
        return;
    }
    try {
        const accountRef = ref(db, `bank_accounts/${id}`);
        await remove(accountRef);
        revalidatePath('/bank-accounts');
        revalidatePath('/transactions/new');
    } catch (e) {
        console.error('Failed to delete bank account:', e);
    }
}


const TransactionSchema = z.object({
    transactionDate: z.string().min(1, 'Date is required.'),
    type: z.enum(['Deposit', 'Withdraw']),
    clientId: z.string().min(1, 'Client is required.'),
    bankAccountId: z.string().min(1, "Bank Account is required.").optional(),
    amount: z.coerce.number().gt(0, 'Amount must be positive.'),
    cryptoWalletId: z.string().optional(),
    usdtAmount: z.coerce.number().optional(),
    notes: z.string().optional(),
    remittanceNumber: z.string().optional(),
    cryptoHash: z.string().optional(),
    clientWalletAddress: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
    flagAml: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
    flagKyc: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
    flagOther: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
});


export async function saveTransaction(prevState: FormState, formData: FormData): Promise<FormState> {
    // Note: File upload (transactionImage) is not handled in this server action yet.
    const validatedFields = TransactionSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        console.log(validatedFields.error.flatten().fieldErrors);
        return {
            message: 'Failed to create transaction. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const { flagAml, flagKyc, flagOther, ...txData } = validatedFields.data;

    try {
        // Get client name for denormalization
        const clientRef = ref(db, `users/${txData.clientId}`);
        const snapshot = await get(clientRef);
        if (!snapshot.exists()) {
            return { message: 'Invalid client selected.' };
        }
        const clientName = snapshot.val().name;

        // TODO: Get Bank Account currency and Crypto wallet for denormalization
        
        // Prepare transaction data
        const transactionData = {
            ...txData,
            clientName,
            reviewFlags: {
                aml: flagAml,
                kyc: flagKyc,
                other: flagOther,
            },
            createdAt: new Date().toISOString(),
        };

        const transactionsRef = ref(db, 'transactions');
        const newTransactionRef = push(transactionsRef);
        await set(newTransactionRef, transactionData);

    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save transaction.';
        return { message: `Database Error: ${errorMessage}` };
    }
    
    revalidatePath('/transactions');
    revalidatePath('/'); // For dashboard KPIs
    redirect('/transactions');
}
