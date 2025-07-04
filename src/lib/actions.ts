'use server';

import { z } from 'zod';
import { customers, customLists } from './data';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Customer } from './types';

const CustomerSchema = z.object({
    id: z.string().optional(),
    name: z.string({required_error: 'Name is required.'}).min(1, 'Name is required.'),
    email: z.string({required_error: 'Email is required.'}).email('Invalid email address.'),
    phone: z.string().optional(),
    address: z.string().optional(),
    notes: z.string().optional(),
    labels: z.preprocess(
      (value) => (Array.isArray(value) ? value : [value]),
      z.array(z.string())
    ).optional(),
});

export type FormState = {
    message: string;
};

export async function saveCustomer(prevState: FormState, formData: FormData) {
    const validatedFields = CustomerSchema.safeParse(
        Object.fromEntries(formData.entries())
    );

    if (!validatedFields.success) {
        return {
            message: validatedFields.error.flatten().fieldErrors[Object.keys(validatedFields.error.flatten().fieldErrors)[0]][0] || 'Invalid data provided.',
        };
    }

    const { id, ...customerData } = validatedFields.data;

    try {
        if (id) {
            // Update
            const customerIndex = customers.findIndex(c => c.id === id);
            if (customerIndex > -1) {
                const existingCustomer = customers[customerIndex];
                customers[customerIndex] = { ...existingCustomer, ...customerData, lastSeen: new Date().toISOString() };
            } else {
                 throw new Error('Customer not found');
            }
        } else {
            // Create
            const newCustomer: Customer = {
                id: `c${customers.length + 1}${Date.now()}`,
                createdAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                avatarUrl: `https://placehold.co/40x40.png?text=${validatedFields.data.name.charAt(0)}`,
                ...customerData,
                labels: customerData.labels || [],
            };
            customers.unshift(newCustomer);
        }
    } catch (e: any) {
        return { message: e.message || 'Failed to save customer.' };
    }

    revalidatePath('/customers');
    revalidatePath('/(app)', 'layout');
    
    if (id) {
        revalidatePath(`/customers/${id}`);
    } else {
       redirect('/customers');
    }

    return { message: 'Customer saved successfully.' };
}

export async function deleteCustomerAction(customerId: string) {
    try {
        const index = customers.findIndex(c => c.id === customerId);
        if (index > -1) {
            customers.splice(index, 1);
            
            // Also remove from any lists
            customLists.forEach(list => {
                list.customerIds = list.customerIds.filter(id => id !== customerId);
            });
        } else {
            throw new Error('Customer not found');
        }
    } catch (e) {
        redirect('/customers?error=Failed to delete customer');
    }

    revalidatePath('/(app)', 'layout');
    redirect('/customers');
}
