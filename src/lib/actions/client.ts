
'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, BlacklistItem, KycDocument } from '../types';
import { normalizeArabic } from '../utils';
import { stripUndefined } from './helpers';
import { redirect } from 'next/navigation';

export type ClientFormState =
  | {
      errors?: {
        name?: string[];
        phone?: string[];
        verification_status?: string[];
        kyc_files?: string[];
      };
      message?: string;
      success?: boolean;
      intent?: string;
      clientId?: string;
    }
  | undefined;

const ClientSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    phone: z.array(z.string().min(1, { message: 'Phone number cannot be empty.' })).min(1, { message: 'At least one phone number is required.' }),
    verification_status: z.enum(['Active', 'Inactive', 'Pending']),
    review_flags: z.array(z.string()).optional(),
    prioritize_sms_matching: z.boolean().default(false),
});


export async function createClient(clientId: string | null, formData: FormData): Promise<ClientFormState> {
    const newId = clientId || push(ref(db, 'clients')).key;
    if (!newId) {
        const errorMsg = "Could not generate a client ID.";
        throw new Error(errorMsg);
    }
    
    const kycFiles = formData.getAll('kyc_files') as File[];
    const uploadedDocuments: KycDocument[] = [];

    if (kycFiles && kycFiles.length > 0) {
        for (const file of kycFiles) {
            if (file.size === 0) continue;
            try {
                const filePath = `kyc_documents/${newId}/${file.name}`;
                const fileRef = storageRef(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                const downloadURL = await getDownloadURL(snapshot.ref);
                uploadedDocuments.push({
                    name: file.name,
                    url: downloadURL,
                    uploadedAt: new Date().toISOString(),
                });
            } catch (error) {
                const errorMessage = (error as any)?.code;
                let userMessage = `File upload failed. Please check server logs.`;
                if (errorMessage === 'storage/unauthorized') userMessage = 'Upload failed due to permissions. Please update your Firebase Storage Rules to allow writes.';
                else if (errorMessage) userMessage = `Upload failed with error: ${errorMessage}. Please check server logs.`;
                return { message: userMessage };
            }
        }
    }

    const dataToValidate = {
        name: formData.get('name'),
        phone: formData.getAll('phone'),
        verification_status: formData.get('verification_status'),
        review_flags: formData.getAll('review_flags'),
        prioritize_sms_matching: formData.get('prioritize_sms_matching') === 'on',
    };

    const validatedFields = ClientSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save client. Please check the fields.',
        };
    }
    
    let isBlacklisted = false;
    try {
        const blacklistSnapshot = await get(ref(db, 'blacklist'));
        if (blacklistSnapshot.exists()) {
            const blacklistItems: BlacklistItem[] = Object.values(blacklistSnapshot.val());
            const clientName = validatedFields.data.name;
            const clientPhones = validatedFields.data.phone;

            for (const item of blacklistItems) {
                if (isBlacklisted) break;
                if (item.type === 'Name') {
                    const clientWords = new Set(clientName.toLowerCase().split(/\s+/));
                    const blacklistWords = item.value.toLowerCase().split(/\s+/);
                    if (blacklistWords.every(word => clientWords.has(word))) {
                        isBlacklisted = true;
                    }
                }
                if (item.type === 'Phone') {
                    for (const clientPhone of clientPhones) {
                        if (clientPhone === item.value) {
                            isBlacklisted = true;
                            break;
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error("Blacklist check failed:", e);
    }
    
    let finalData: Partial<Omit<Client, 'id' | 'kyc_documents'>> = validatedFields.data;

    if (isBlacklisted) {
        if (!finalData.review_flags) finalData.review_flags = [];
        if (!finalData.review_flags.includes('Blacklisted')) {
            finalData.review_flags.push('Blacklisted');
        }
    }
    
    const dataForFirebase = stripUndefined(finalData);

    try {
        const clientDbRef = ref(db, `clients/${clientId || newId}`);
        const snapshot = await get(clientDbRef);
        const existingData = snapshot.val() as Client | null;
        const existingDocs = existingData?.kyc_documents || [];
        
        dataForFirebase.kyc_documents = [...existingDocs, ...uploadedDocuments];

        if (clientId) {
            await update(clientDbRef, dataForFirebase);
        } else {
            await set(clientDbRef, {
                ...dataForFirebase,
                createdAt: new Date().toISOString()
            });
        }
    } catch (error) {
        return { message: 'Database Error: Failed to save client data. Check server logs.' }
    }
    
    if (clientId) {
        revalidatePath(`/clients/${clientId}/edit`);
    }
    revalidatePath('/clients');
    
    return { success: true, message: 'Client saved successfully.', clientId: clientId || newId };
}

export async function manageClient(clientId: string, formData: FormData): Promise<ClientFormState> {
    const intent = formData.get('intent') as string;
    
    if (intent?.startsWith('delete:')) {
        const documentName = intent.split(':')[1];
        if (!documentName) {
            return { message: 'Document name not provided for deletion.' };
        }
        try {
            const filePath = `kyc_documents/${clientId}/${documentName}`;
            const fileRef = storageRef(storage, filePath);
            await deleteObject(fileRef);

            const clientRef = ref(db, `clients/${clientId}`);
            const snapshot = await get(clientRef);
            if (snapshot.exists()) {
                const clientData = snapshot.val() as Client;
                const updatedDocs = clientData.kyc_documents?.filter(doc => doc.name !== documentName) || [];
                await update(clientRef, { kyc_documents: updatedDocs });
            }

            revalidatePath(`/clients/${clientId}/edit`);
            return { success: true, message: "Document deleted successfully.", intent };
        } catch (error) {
            const errorMessage = (error as any)?.code;
            let userMessage = `Failed to delete document. Please check server logs.`;
            if (errorMessage === 'storage/unauthorized') userMessage = 'Deletion failed due to permissions. Please update your Firebase Storage Rules to allow deletes.';
            else if (errorMessage) userMessage = `Deletion failed with error: ${errorMessage}. Please check server logs.`;
            return { message: userMessage };
        }
    } else if (intent?.startsWith('delete_address:')) {
        const addressToDelete = intent.substring('delete_address:'.length);
        if (!addressToDelete) {
            return { message: 'Address not provided for deletion.' };
        }

        try {
            const clientRef = ref(db, `clients/${clientId}`);
            const snapshot = await get(clientRef);

            if (snapshot.exists()) {
                const clientData = snapshot.val() as Client;
                const updatedAddresses = clientData.bep20_addresses?.filter(addr => addr !== addressToDelete) || [];
                await update(clientRef, { bep20_addresses: updatedAddresses });
            }

            revalidatePath(`/clients/${clientId}/edit`);
            return { success: true, message: "Address removed successfully.", intent };
        } catch (error) {
            console.error("Failed to delete address:", error);
            return { message: 'Database Error: Failed to remove address.' };
        }
    } else if (intent?.startsWith('unfavorite_bank_account:')) {
        const accountIdToUnfavorite = intent.substring('unfavorite_bank_account:'.length);
        if (!accountIdToUnfavorite) {
            return { message: 'Bank account ID not provided.' };
        }
        try {
            const clientRef = ref(db, `clients/${clientId}`);
            const snapshot = await get(clientRef);
            if (snapshot.exists()) {
                const clientData = snapshot.val() as Client;
                if (clientData.favoriteBankAccountId === accountIdToUnfavorite) {
                    await update(clientRef, {
                        favoriteBankAccountId: null,
                        favoriteBankAccountName: null
                    });
                     revalidatePath(`/clients/${clientId}/edit`);
                    return { success: true, message: "Client's favorite bank account link has been removed.", intent };
                } else {
                    return { success: true, message: "This was not the favorite account, so no link was removed.", intent };
                }
            }
             return { message: 'Client not found.' };
        } catch (error) {
            return { message: 'Database Error: Failed to remove favorite bank account link.' };
        }
    }

    // Default action is to update/create the client
    if (!formData) {
        return { message: 'Form data is required for saving.' };
    }
    return createClient(clientId, formData);
}

export async function searchClients(searchTerm: string): Promise<Client[]> {
    if (!searchTerm || searchTerm.trim().length < 2) {
        return [];
    }

    try {
        const clientsRef = ref(db, 'clients');
        const snapshot = await get(clientsRef);

        if (!snapshot.exists()) {
            return [];
        }
        
        const allClientsData: Record<string, Client> = snapshot.val();
        
        const normalizedSearch = normalizeArabic(searchTerm.toLowerCase().trim());
        const searchTerms = normalizedSearch.split(' ').filter(Boolean);
        const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(' ') : phone || '';

        const filtered = Object.keys(allClientsData).map(key => ({ id: key, ...allClientsData[key] })).filter(client => {
            const phone = getPhone(client.phone).toLowerCase();
            
            if (phone.includes(searchTerm.trim())) {
                return true;
            }

            const name = normalizeArabic((client.name || '').toLowerCase());
            const nameWords = name.split(' ');
            return searchTerms.every(term => 
                nameWords.some(nameWord => nameWord.startsWith(term))
            );
        });

        // Sort results to prioritize better matches
        filtered.sort((a, b) => {
            const aName = normalizeArabic((a.name || '').toLowerCase());
            const bName = normalizeArabic((b.name || '').toLowerCase());

            // 1. Exact match = highest priority
            const aIsExact = aName === normalizedSearch;
            const bIsExact = bName === normalizedSearch;
            if (aIsExact && !bIsExact) return -1;
            if (!aIsExact && bIsExact) return 1;

            // 2. Starts with the search term = second highest priority
            const aStartsWith = aName.startsWith(normalizedSearch);
            const bStartsWith = bName.startsWith(normalizedSearch);
            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            
            // 3. Fallback to alphabetical sort
            return aName.localeCompare(bName);
        });

        // Return a limited number of results for performance
        return filtered.slice(0, 20);
    } catch (error) {
        console.error("Error searching clients:", error);
        return [];
    }
}

export type ImportState = { message?: string; error?: boolean; } | undefined;

const ImportedClientSchema = z.object({
  uniqueId: z.string().min(1, 'uniqueId is required.'),
  dateOfAddition: z.string().min(1, 'dateOfAddition is required.'),
  firstName: z.string().min(1, 'firstName is required.'),
  secondName: z.string().optional(),
  thirdName: z.string().optional(),
  lastName: z.string().min(1, 'lastName is required.'),
  phoneNumber: z.string().min(1, 'phoneNumber is required.'),
});

export async function importClients(prevState: ImportState, formData: FormData): Promise<ImportState> {
    const file = formData.get('jsonFile') as File | null;

    if (!file || file.size === 0) {
        return { message: 'No file uploaded.', error: true };
    }

    if (file.type !== 'application/json') {
        return { message: 'Invalid file type. Please upload a JSON file.', error: true };
    }

    try {
        const fileContent = await file.text();
        let jsonData;
        try {
            jsonData = JSON.parse(fileContent);
        } catch (e) {
            return { message: "Failed to parse JSON file. Please ensure it's valid JSON (e.g., wrapped in `[]` with no trailing commas).", error: true };
        }
        

        if (!Array.isArray(jsonData)) {
             return { message: 'JSON file must contain an array of client objects.', error: true };
        }
        
        const clientsToProcess = jsonData;
        const updates: { [key: string]: any } = {};
        let importedCount = 0;
        let skippedCount = 0;

        const existingClientsSnapshot = await get(ref(db, 'clients'));
        const existingClients = existingClientsSnapshot.val() || {};
        const existingIds = new Set(Object.keys(existingClients));

        for (const importedClient of clientsToProcess) {
            const validatedData = ImportedClientSchema.safeParse(importedClient);
            
            if (!validatedData.success || (validatedData.data.uniqueId && existingIds.has(validatedData.data.uniqueId))) {
                skippedCount++;
                continue;
            }

            const { uniqueId, dateOfAddition, firstName, secondName, thirdName, lastName, phoneNumber } = validatedData.data;

            const name = [firstName, secondName, thirdName, lastName].filter(Boolean).join(' ');

            const newClient: Omit<Client, 'id'> = {
                name: name,
                phone: [phoneNumber],
                verification_status: 'Active',
                review_flags: [],
                createdAt: new Date(dateOfAddition).toISOString(),
            };
            
            updates[`/clients/${uniqueId}`] = stripUndefined(newClient);
            importedCount++;
        }

        if (importedCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/clients');
        
        let message = `Successfully imported ${importedCount} new clients.`;
        if (skippedCount > 0) {
            message += ` ${skippedCount} records were skipped due to errors, missing fields, or duplicates.`;
        }

        return { message, error: false };

    } catch (error: any) {
        console.error("Client Import Error:", error);
        return { message: error.message || "An unknown error occurred during import.", error: true };
    }
}
