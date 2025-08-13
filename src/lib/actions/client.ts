

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, BlacklistItem, KycDocument, ServiceProvider, ClientServiceProvider } from '../types';
import { normalizeArabic } from '../utils';
import { stripUndefined, logAction } from './helpers';
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
    prioritize_sms_matching: z.boolean().default(false),
});


export async function createClient(clientId: string | null, formData: FormData): Promise<ClientFormState> {
    const isEditing = !!clientId;
    const newId = isEditing ? clientId : (await get(ref(db, 'clients'))).size + 1000001;

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
        prioritize_sms_matching: formData.get('prioritize_sms_matching') === 'on',
    };

    const validatedFields = ClientSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save client. Please check the fields.',
        };
    }
    
    let finalData: Partial<Omit<Client, 'id' | 'kyc_documents'>> = validatedFields.data;
    
    const dataForFirebase = stripUndefined(finalData);

    try {
        const clientDbRef = ref(db, `clients/${newId}`);
        const snapshot = await get(clientDbRef);
        const existingData = snapshot.val() as Client | null;
        const existingDocs = existingData?.kyc_documents || [];
        
        dataForFirebase.kyc_documents = [...existingDocs, ...uploadedDocuments];
        
        const updates: { [key: string]: any } = {};

        if (isEditing) {
            updates[`/clients/${newId}`] = { ...existingData, ...dataForFirebase };
        } else {
            updates[`/clients/${newId}`] = {
                ...dataForFirebase,
                createdAt: new Date().toISOString()
            };
            // Create a corresponding liability sub-account
            const clientAccountId = `6001${String(newId).slice(-4)}`; // e.g. 60010001
            updates[`/accounts/${clientAccountId}`] = {
                name: validatedFields.data.name,
                type: 'Liabilities',
                isGroup: false,
                parentId: '6000',
                currency: 'USD',
                priority: 999
            };
        }
        
        await update(ref(db), updates);
        
        await logAction(
            isEditing ? 'update_client' : 'create_client',
            { type: 'client', id: String(newId), name: validatedFields.data.name },
            { new: dataForFirebase, old: existingData }
        );

    } catch (error) {
        return { message: 'Database Error: Failed to save client data. Check server logs.' }
    }
    
    revalidatePath('/clients');
    if (clientId) {
        revalidatePath(`/clients/${clientId}/edit`);
    }
    revalidatePath('/logs');
    
    return { success: true, message: 'Client saved successfully.', clientId: String(newId) };
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

                await logAction(
                    'delete_client_kyc',
                    { type: 'client', id: clientId, name: clientData.name },
                    { documentName: documentName }
                );
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
                 await logAction(
                    'delete_client_address',
                    { type: 'client', id: clientId, name: clientData.name },
                    { address: addressToDelete }
                );
            }

            revalidatePath(`/clients/${clientId}/edit`);
            return { success: true, message: "Address removed successfully.", intent };
        } catch (error) {
            console.error("Failed to delete address:", error);
            return { message: 'Database Error: Failed to remove address.' };
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

export async function findClientByAddress(address: string): Promise<Client | null> {
    if (!address) return null;
    const lowercasedAddress = address.toLowerCase();
    
    try {
        const clientsRef = ref(db, 'clients');
        const snapshot = await get(clientsRef);

        if (!snapshot.exists()) {
            return null;
        }
        
        const allClientsData: Record<string, Client> = snapshot.val();

        for (const clientId in allClientsData) {
            const client = allClientsData[clientId];
            if (client.serviceProviders) {
                for (const provider of client.serviceProviders) {
                    if (provider.providerType === 'Crypto' && provider.details.Address?.toLowerCase() === lowercasedAddress) {
                        return { id: clientId, ...client };
                    }
                }
            }
        }
        return null; // No client found
    } catch (error) {
        console.error("Error finding client by address:", error);
        return null;
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
                createdAt: new Date(dateOfAddition).toISOString(),
            };
            
            updates[`/clients/${uniqueId}`] = stripUndefined(newClient);
            await logAction('import_client', { type: 'client', id: uniqueId, name }, newClient);
            importedCount++;
        }

        if (importedCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/clients');
        revalidatePath('/logs');
        
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

export async function findUnassignedTransactionsByAddress(walletAddress: string): Promise<number> {
    if (!walletAddress) return 0;
    
    try {
        const transactionsSnapshot = await get(ref(db, 'transactions'));
        if (!transactionsSnapshot.exists()) return 0;

        const allTxs: Record<string, Transaction> = transactionsSnapshot.val();
        let count = 0;

        for (const txId in allTxs) {
            const tx = allTxs[txId];
            if (
                tx.clientId === 'unassigned-bscscan' &&
                tx.client_wallet_address?.toLowerCase() === walletAddress.toLowerCase()
            ) {
                count++;
            }
        }
        return count;
    } catch (error) {
        console.error("Error finding unassigned transactions:", error);
        return 0;
    }
}

export async function batchUpdateClientForTransactions(clientId: string, walletAddress: string): Promise<{error?: boolean, message: string}> {
     if (!clientId || !walletAddress) {
        return { error: true, message: "Client ID and wallet address are required." };
    }
    
    try {
        const clientSnapshot = await get(ref(db, `clients/${clientId}`));
        if (!clientSnapshot.exists()) {
            return { error: true, message: "Client not found." };
        }
        const clientName = clientSnapshot.val().name;

        const transactionsSnapshot = await get(ref(db, 'transactions'));
        if (!transactionsSnapshot.exists()) return { message: "No transactions to update."};

        const allTxs: Record<string, Transaction> = transactionsSnapshot.val();
        const updates: Record<string, any> = {};
        let updatedCount = 0;

        for (const txId in allTxs) {
            const tx = allTxs[txId];
            if (
                tx.clientId === 'unassigned-bscscan' &&
                tx.client_wallet_address?.toLowerCase() === walletAddress.toLowerCase()
            ) {
                updates[`/transactions/${txId}/clientId`] = clientId;
                updates[`/transactions/${txId}/clientName`] = clientName;
                updatedCount++;
            }
        }
        
        if (updatedCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        return { message: `Successfully updated ${updatedCount} transaction(s) for client ${clientName}.`};

    } catch(error) {
        console.error("Error during batch update:", error);
        return { error: true, message: "A database error occurred during the batch update." };
    }
}


export type SetupState = { message?: string; error?: boolean; } | undefined;

export async function migrateBep20Addresses(prevState: SetupState, formData: FormData): Promise<SetupState> {
    try {
        const [clientsSnapshot, providersSnapshot] = await Promise.all([
            get(ref(db, 'clients')),
            get(ref(db, 'service_providers'))
        ]);
        
        if (!clientsSnapshot.exists()) {
            return { message: "No clients to migrate.", error: false };
        }
        if (!providersSnapshot.exists()) {
            return { message: "Service Providers are not set up. Cannot migrate.", error: true };
        }

        const allClients: Record<string, Client> = clientsSnapshot.val();
        const allProviders: Record<string, ServiceProvider> = providersSnapshot.val();
        
        const bep20Provider = Object.entries(allProviders).find(([,p]) => p.name === 'BEP20');
        if (!bep20Provider) {
            return { message: 'A Service Provider named "BEP20" must exist to perform this migration.', error: true };
        }
        const [providerId, providerDetails] = bep20Provider;

        const updates: Record<string, any> = {};
        let migratedCount = 0;

        for (const clientId in allClients) {
            const client = allClients[clientId];
            if (client.bep20_addresses && client.bep20_addresses.length > 0) {
                const existingServiceProviders = client.serviceProviders || [];
                
                const newServiceProviders = client.bep20_addresses.map(address => ({
                    providerId: providerId,
                    providerName: providerDetails.name,
                    providerType: providerDetails.type,
                    details: { Address: address }
                }));
                
                // Simple merge, could be improved to avoid duplicates if run multiple times
                const finalProviders = [...existingServiceProviders, ...newServiceProviders];
                
                updates[`/clients/${clientId}/serviceProviders`] = finalProviders;
                updates[`/clients/${clientId}/bep20_addresses`] = null; // Clear old field
                migratedCount++;
            }
        }
        
        if (migratedCount > 0) {
            await update(ref(db), updates);
            revalidatePath('/clients');
            return { message: `Successfully migrated BEP20 addresses for ${migratedCount} clients.`, error: false };
        }

        return { message: "No clients with legacy BEP20 addresses were found.", error: false };

    } catch (e: any) {
        console.error("BEP20 Migration Error:", e);
        return { message: e.message || 'An unknown error occurred during migration.', error: true };
    }
}
