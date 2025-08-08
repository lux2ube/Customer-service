'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { stripUndefined, logAction } from './helpers';
import { redirect } from 'next/navigation';

export type ServiceProviderFormState =
  | {
      errors?: {
        name?: string[];
        type?: string[];
        accountIds?: string[];
      };
      message?: string;
      success?: boolean;
    }
  | undefined;

const ServiceProviderSchema = z.object({
  name: z.string().min(1, { message: 'Provider name is required.' }),
  type: z.enum(['Bank', 'Crypto']),
  accountIds: z.array(z.string()).min(1, { message: 'At least one account must be selected.' }),
});

export async function createServiceProvider(providerId: string | null, prevState: ServiceProviderFormState, formData: FormData) {
    const dataToValidate = {
        name: formData.get('name'),
        type: formData.get('type'),
        accountIds: formData.getAll('accountIds'),
    };
    
    const validatedFields = ServiceProviderSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save service provider. Please check the fields.',
        };
    }
    
    const data = validatedFields.data;
    const isEditing = !!providerId;
    
    try {
        if (isEditing) {
            const providerRef = ref(db, `service_providers/${providerId}`);
            await update(providerRef, data);
        } else {
            const newProviderRef = push(ref(db, 'service_providers'));
            await set(newProviderRef, {
                ...data,
                createdAt: new Date().toISOString(),
            });
        }
        
        await logAction(
            isEditing ? 'update_service_provider' : 'create_service_provider',
            { type: 'service_provider', id: providerId || 'new', name: data.name },
            data
        );

    } catch (error) {
        return { message: 'Database Error: Failed to save service provider.' }
    }
    
    revalidatePath('/service-providers');
    redirect('/service-providers');
}

export async function deleteServiceProvider(providerId: string) {
    if (!providerId) {
        return { message: 'Invalid provider ID.' };
    }
    try {
        const providerRef = ref(db, `service_providers/${providerId}`);
        const snapshot = await get(providerRef);
        if (!snapshot.exists()) {
            return { message: 'Service Provider not found.' };
        }
        const providerData = snapshot.val();
        await remove(providerRef);

        await logAction(
            'delete_service_provider',
            { type: 'service_provider', id: providerId, name: providerData.name },
            { deletedData: providerData }
        );

        revalidatePath('/service-providers');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete service provider.' };
    }
}
