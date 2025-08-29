

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { logAction } from './helpers';

const LabelSchema = z.object({
  name: z.string().min(1, { message: 'Label name is required.' }),
  color: z.string().startsWith('#', { message: 'Color must be a valid hex code.' }),
  description: z.string().optional(),
});

export async function createLabel(formData: FormData) {
    const validatedFields = LabelSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save label. Please check the fields.',
        };
    }

    try {
        const newRef = push(ref(db, 'labels'));
        await set(newRef, {
            ...validatedFields.data,
            id: newRef.key,
            createdAt: new Date().toISOString(),
        });

        await logAction(
            'create_label',
            { type: 'transaction_flag', id: newRef.key!, name: validatedFields.data.name },
            validatedFields.data
        );

        revalidatePath('/labels');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to save label.' };
    }
}

export async function deleteLabel(id: string) {
    if (!id) return { message: 'Invalid ID provided.' };
    try {
        await remove(ref(db, `labels/${id}`));
        revalidatePath('/labels');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete label.' };
    }
}
