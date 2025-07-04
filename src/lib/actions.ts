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
    errors?: {
        name?: string[];
        phone?: string[];
        verificationStatus?: string[];
        // Transaction form errors
        type?: string[];
        clientId?: string[];
        amount?: string[];
        status?: string[];
    }
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


const TransactionSchema = z.object({
    type: z.enum(['Deposit', 'Withdraw'], { required_error: "Transaction type is required." }),
    clientId: z.string().min(1, 'Client is required.'),
    amount: z.coerce.number({invalid_type_error: "Amount must be a number."}).gt(0, 'Amount must be positive.'),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled'], { required_error: "Status is required." }),
});

export async function saveTransaction(prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = TransactionSchema.safeParse({
        type: formData.get('type'),
        clientId: formData.get('clientId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to create transaction. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }

    try {
        // Get client name for denormalization
        const clientRef = ref(db, `users/${validatedFields.data.clientId}`);
        const snapshot = await get(clientRef);
        if (!snapshot.exists()) {
            return { message: 'Invalid client selected.' };
        }
        const clientName = snapshot.val().name;

        // Prepare transaction data
        const transactionData = {
            ...validatedFields.data,
            clientName,
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
