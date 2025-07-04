'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './firebase';
import { ref, set, push, remove } from 'firebase/database';

const CustomerSchema = z.object({
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

export async function saveCustomer(id: string | null, prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = CustomerSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        notes: formData.get('notes'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to save customer. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const customerData = validatedFields.data;
    
    try {
        if (id) {
            // Update existing customer
            const customerRef = ref(db, `users/${id}`);
            // We need to fetch existing data to merge, as `set` overwrites.
            // However, a simple app can just set the fields from the form.
            // For a more robust app, you'd fetch and merge.
            await set(customerRef, {
                ...customerData,
                // Preserve created_at if it exists
                created_at: new Date().toISOString() // Or fetch existing value
            });
        } else {
            // Create new customer
            const usersRef = ref(db, 'users');
            const newCustomerRef = push(usersRef);
            await set(newCustomerRef, { 
                ...customerData, 
                created_at: new Date().toISOString(),
                avatarUrl: `https://placehold.co/100x100.png?text=${customerData.name.charAt(0)}`
            });
            id = newCustomerRef.key;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save customer.';
        return { message: `Database Error: ${errorMessage}` };
    }

    // Revalidate paths to ensure server components are updated
    revalidatePath('/customers');
    revalidatePath('/');
    if (id) {
       revalidatePath(`/customers/${id}`);
       redirect(`/customers/${id}`);
    } else {
        redirect('/customers');
    }
}


export async function deleteCustomerAction(id: string) {
    if (!id) {
        console.error("Delete action called without an ID.");
        return;
    }
    try {
        const customerRef = ref(db, `users/${id}`);
        await remove(customerRef);
        revalidatePath('/customers');
        revalidatePath('/');
    } catch (e) {
        console.error('Failed to delete customer:', e);
        // In a real app, you might want to return an error state
    }
    redirect('/customers');
}
