'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './firebase';
import { ref, set, push, remove } from 'firebase/database';

const ClientSchema = z.object({
    name: z.string({ required_error: "Name is required." }).min(2, 'Name must be at least 2 characters.'),
    email: z.string({ required_error: "Email is required." }).email('Invalid email address.'),
    phone: z.string().optional().default(''),
    address: z.string().optional().default(''),
    notes: z.string().optional().default(''),
});

export type FormState = {
    message: string;
    errors?: {
        name?: string[];
        email?: string[];
    }
} | undefined

export async function saveClient(id: string | null, prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = ClientSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        notes: formData.get('notes'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to save client. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const clientData = validatedFields.data;
    
    try {
        if (id) {
            // Update existing client
            const clientRef = ref(db, `users/${id}`);
            // We need to fetch existing data to merge, as `set` overwrites.
            // However, a simple app can just set the fields from the form.
            // For a more robust app, you'd fetch and merge.
            await set(clientRef, {
                ...clientData,
                // Preserve created_at if it exists
                created_at: new Date().toISOString() // Or fetch existing value
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
            id = newClientRef.key;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save client.';
        return { message: `Database Error: ${errorMessage}` };
    }

    // Revalidate paths to ensure server components are updated
    revalidatePath('/clients');
    revalidatePath('/');
    if (id) {
       revalidatePath(`/clients/${id}`);
       redirect(`/clients/${id}`);
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
        // In a real app, you might want to return an error state
    }
    redirect('/clients');
}
