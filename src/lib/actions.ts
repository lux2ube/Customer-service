'use server';

import { z } from 'zod';
import { createCustomer, updateCustomer, deleteCustomer, getCustomerById } from './data';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const CustomerSchema = z.object({
    id: z.string().optional(),
    name: z.string({ required_error: "Name is required." }).min(2, 'Name must be at least 2 characters.'),
    email: z.string({ required_error: "Email is required." }).email('Invalid email address.'),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    labels: z.array(z.string()).optional().default([]),
});

export type FormState = {
    message: string;
    errors?: {
        name?: string[];
        email?: string[];
        phone?: string[];
        address?: string[];
        notes?: string[];
    }
} | undefined

export async function saveCustomer(prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = CustomerSchema.safeParse({
        id: formData.get('id') || undefined,
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        notes: formData.get('notes'),
        labels: formData.getAll('labels'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to save customer. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    let { id, ...customerData } = validatedFields.data;
    let customerId = id;
    
    try {
        if (customerId) {
            // Update existing customer
            const existingCustomer = await getCustomerById(customerId);
            if (!existingCustomer) throw new Error("Customer not found for update.");

            await updateCustomer({ 
                ...existingCustomer,
                ...customerData, 
            });
        } else {
            // Create new customer
            const newCustomer = await createCustomer({ 
                ...customerData, 
                avatarUrl: `https://placehold.co/100x100.png?text=${customerData.name.charAt(0)}`
            });
            customerId = newCustomer.id;
        }
    } catch (e) {
        return { message: `Database Error: ${e instanceof Error ? e.message : 'Failed to save customer.'}` };
    }

    revalidatePath('/customers');
    if (customerId) {
       revalidatePath(`/customers/${customerId}`);
       revalidatePath('/');
       redirect(`/customers/${customerId}`);
    }

    return { message: 'This should not be reached if redirect works' };
}


export async function deleteCustomerAction(id: string) {
    try {
        await deleteCustomer(id);
        revalidatePath('/customers');
        revalidatePath('/lists');
        revalidatePath('/');
    } catch (e) {
        // In a real app, you'd want to handle this more gracefully
        console.error('Failed to delete customer:', e);
        // You might want to return an error state instead of just redirecting
    }
    redirect('/customers');
}
