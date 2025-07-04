'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from './firebase';
import { ref, set, push, remove, get } from 'firebase/database';

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
        source?: string[];
        status?: string[];
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
    let clientId = id;
    
    try {
        if (clientId) {
            // Update existing client
            const clientRef = ref(db, `users/${clientId}`);
            const snapshot = await get(clientRef);
            const existingClient = snapshot.val() || {};
            await set(clientRef, {
                ...clientData,
                created_at: existingClient.created_at || new Date().toISOString(),
                avatarUrl: existingClient.avatarUrl || `https://placehold.co/100x100.png?text=${clientData.name.charAt(0)}`
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

// Lead Actions
const LeadSchema = z.object({
    name: z.string({ required_error: "Name is required." }).min(2, 'Name must be at least 2 characters.'),
    email: z.string({ required_error: "Email is required." }).email('Invalid email address.'),
    phone: z.string().optional().default(''),
    source: z.string().min(1, 'Source is required.'),
    status: z.enum(['New', 'Contacted', 'Qualified', 'Unqualified'], { required_error: "Status is required." }),
});


export async function saveLead(id: string | null, prevState: FormState, formData: FormData): Promise<FormState> {
    const validatedFields = LeadSchema.safeParse({
        name: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        source: formData.get('source'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            message: 'Failed to save lead. Please check the fields.',
            errors: validatedFields.error.flatten().fieldErrors,
        }
    }
    
    const leadData = validatedFields.data;
    let leadId = id;
    
    try {
        if (leadId) {
            // Update existing lead
            const leadRef = ref(db, `leads/${leadId}`);
            const snapshot = await get(leadRef);
            const existingLead = snapshot.val() || {};
            await set(leadRef, {
                ...leadData,
                created_at: existingLead.created_at || new Date().toISOString(),
            });
        } else {
            // Create new lead
            const leadsRef = ref(db, 'leads');
            const newLeadRef = push(leadsRef);
            await set(newLeadRef, { 
                ...leadData, 
                created_at: new Date().toISOString(),
            });
            leadId = newLeadRef.key;
        }
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'Failed to save lead.';
        return { message: `Database Error: ${errorMessage}` };
    }

    revalidatePath('/leads');
    revalidatePath('/');
    if (leadId) {
       revalidatePath(`/leads/${leadId}`);
       redirect(`/leads/${leadId}`);
    } else {
        redirect('/leads');
    }
}


export async function deleteLeadAction(id: string) {
    if (!id) {
        console.error("Delete action called without an ID.");
        return;
    }
    try {
        const leadRef = ref(db, `leads/${id}`);
        await remove(leadRef);
        revalidatePath('/leads');
        revalidatePath('/');
    } catch (e) {
        console.error('Failed to delete lead:', e);
    }
    redirect('/leads');
}
