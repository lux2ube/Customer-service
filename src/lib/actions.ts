
'use server';

import { z } from 'zod';
import { db, storage } from './firebase';
import { push, ref, set, update, get, remove, query, orderByChild, startAt, endAt } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, KycDocument, BlacklistItem, BankAccount, SmsTransaction, ParsedSms, SmsParsingRule } from './types';
import { parseSms } from '@/lib/sms-parser';
import { parseSmsWithAi } from '@/ai/flows/parse-sms-flow';
import { parseSmsWithCustomRules } from './custom-sms-parser';
import { normalizeArabic } from './utils';


// Helper to strip undefined values from an object, which Firebase doesn't allow.
const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
    const newObj: Record<string, any> = {};
    for (const key in obj) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            newObj[key] = obj[key];
        }
    }
    return newObj;
};

const PROFIT_ACCOUNT_ID = '4001';
const EXPENSE_ACCOUNT_ID = '5001';


export type JournalEntryFormState =
  | {
      errors?: {
        date?: string[];
        description?: string[];
        debit_account?: string[];
        credit_account?: string[];
        debit_amount?: string[];
        credit_amount?: string[];
      };
      message?: string;
    }
  | undefined;


const JournalEntrySchema = z.object({
    date: z.string({ invalid_type_error: 'Please select a date.' }),
    description: z.string().min(1, { message: 'Description is required.' }),
    debit_account: z.string().min(1, { message: 'Please select a debit account.' }),
    credit_account: z.string().min(1, { message: 'Please select a credit account.' }),
    debit_amount: z.coerce.number().gt(0, { message: 'Debit amount must be positive.' }),
    debit_currency: z.string(),
    credit_amount: z.coerce.number().gt(0, { message: 'Credit amount must be positive.' }),
    credit_currency: z.string(),
    amount_usd: z.coerce.number().gt(0, { message: 'USD amount must be positive.' }),
});


export async function createJournalEntry(prevState: JournalEntryFormState, formData: FormData) {
    const validatedFields = JournalEntrySchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create journal entry. Please check the fields.',
        };
    }

    const { date, description, debit_account, credit_account, debit_amount, debit_currency, credit_amount, credit_currency, amount_usd } = validatedFields.data;

    if (debit_account === credit_account) {
        return {
            errors: {
                debit_account: ['Debit and credit accounts cannot be the same.'],
                credit_account: ['Debit and credit accounts must be the same.'],
            },
            message: 'Debit and credit accounts must be different.'
        }
    }

    // Denormalize account names
    let debit_account_name = '';
    let credit_account_name = '';
    try {
        const debitSnapshot = await get(ref(db, `accounts/${debit_account}`));
        if (debitSnapshot.exists()) debit_account_name = (debitSnapshot.val() as Account).name;
        const creditSnapshot = await get(ref(db, `accounts/${credit_account}`));
        if (creditSnapshot.exists()) credit_account_name = (creditSnapshot.val() as Account).name;
    } catch(e) { console.error("Could not fetch account names for journal entry"); }


    try {
        const newEntryRef = push(ref(db, 'journal_entries'));
        await set(newEntryRef, {
            date,
            description,
            debit_account,
            credit_account,
            debit_amount,
            debit_currency,
            credit_amount,
            credit_currency,
            amount_usd,
            debit_account_name,
            credit_account_name,
            createdAt: new Date().toISOString(),
        });
    } catch (error) {
        return {
            message: 'Database Error: Failed to create journal entry.'
        }
    }
    
    revalidatePath('/accounting/journal');
    redirect('/accounting/journal');
}


// --- Client Actions ---
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
    }
  | undefined;

const ClientSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    phone: z.array(z.string().min(1, { message: 'Phone number cannot be empty.' })).min(1, { message: 'At least one phone number is required.' }),
    verification_status: z.enum(['Active', 'Inactive', 'Pending']),
    review_flags: z.array(z.string()).optional(),
});


export async function createClient(clientId: string | null, prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
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
    redirect('/clients');
}

export async function manageClient(clientId: string, prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
    const intent = formData.get('intent') as string | null;

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
    return createClient(clientId, prevState, formData);
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
        const allClients: Client[] = Object.keys(allClientsData).map(key => ({
            id: key,
            ...allClientsData[key]
        }));
        
        const normalizedSearch = normalizeArabic(searchTerm.toLowerCase().trim());
        const searchTerms = normalizedSearch.split(' ').filter(Boolean);
        const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(' ') : phone || '';

        const filtered = allClients.filter(client => {
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

        // New Sorting Logic for prioritization
        if (searchTerms.length === 1) {
            filtered.sort((a, b) => {
                const aName = normalizeArabic((a.name || '').toLowerCase());
                const bName = normalizeArabic((b.name || '').toLowerCase());
                const aFirstName = aName.split(' ')[0];
                const bFirstName = bName.split(' ')[0];

                const aIsFirstNameMatch = aFirstName.startsWith(normalizedSearch);
                const bIsFirstNameMatch = bFirstName.startsWith(normalizedSearch);
                
                if (aIsFirstNameMatch && !bIsFirstNameMatch) {
                    return -1; // a comes first
                }
                if (!aIsFirstNameMatch && bIsFirstNameMatch) {
                    return 1; // b comes first
                }
                
                // For ties, or if neither is a first name match, sort by full name alphabetically
                return aName.localeCompare(bName);
            });
        }

        // Return a limited number of results for performance
        return filtered.slice(0, 20);
    } catch (error) {
        console.error("Error searching clients:", error);
        return [];
    }
}


// --- Transaction Actions ---
export type TransactionFormState =
  | {
      errors?: {
        date?: string[];
        clientId?: string[];
        type?: string[];
        amount?: string[];
        currency?: string[];
        attachment_url?: string[];
      };
      message?: string;
    }
  | undefined;

const TransactionSchema = z.object({
    date: z.string({ invalid_type_error: 'Please select a date.' }),
    clientId: z.string().optional(),
    type: z.enum(['Deposit', 'Withdraw']),
    amount: z.coerce.number().gt(0, { message: 'Amount must be greater than 0.' }),
    currency: z.enum(['USD', 'YER', 'SAR', 'USDT']),
    bankAccountId: z.string().optional().nullable(),
    cryptoWalletId: z.string().optional().nullable(),
    amount_usd: z.coerce.number(),
    fee_usd: z.coerce.number(),
    expense_usd: z.coerce.number().optional(),
    amount_usdt: z.coerce.number(),
    attachment_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    notes: z.string().optional(),
    remittance_number: z.string().optional(),
    hash: z.string().optional(),
    client_wallet_address: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
    flags: z.array(z.string()).optional(),
    linkedSmsId: z.string().optional().nullable(),
});


export async function createTransaction(transactionId: string | null, prevState: TransactionFormState, formData: FormData) {
    const newId = transactionId || push(ref(db, 'transactions')).key;
    if (!newId) throw new Error("Could not generate a transaction ID.");

    const attachmentFile = formData.get('attachment_url') as File | null;
    let attachmentUrlString: string | undefined = undefined;
    
    if (attachmentFile && attachmentFile.size > 0) {
        try {
            const fileRef = storageRef(storage, `transaction_attachments/${newId}/${attachmentFile.name}`);
            const snapshot = await uploadBytes(fileRef, attachmentFile);
            attachmentUrlString = await getDownloadURL(snapshot.ref);
        } catch (error) {
            return { message: 'File upload failed. Please try again.' };
        }
    }

    const flag = formData.get('flags');
    const dataToValidate = {
        ...Object.fromEntries(formData.entries()),
        attachment_url: attachmentUrlString,
        flags: flag ? [flag] : [],
    };
    
    const validatedFields = TransactionSchema.safeParse(dataToValidate);
    
    if (!validatedFields.success) {
        console.log(validatedFields.error.flatten());
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    let dataToSave = { ...validatedFields.data };
    let finalClientId = dataToSave.clientId;

    // If no client was selected, try to find one by wallet address
    if (!finalClientId && dataToSave.client_wallet_address) {
        try {
            const clientsSnapshot = await get(ref(db, 'clients'));
            const clientsData: Record<string, Client> = clientsSnapshot.val() || {};
            const addressToClientMap: Record<string, string> = {};
            for (const clientId in clientsData) {
                const client = clientsData[clientId];
                if (client.bep20_addresses) {
                    for (const address of client.bep20_addresses) {
                        addressToClientMap[address.toLowerCase()] = clientId;
                    }
                }
            }
            const matchedClientId = addressToClientMap[dataToSave.client_wallet_address.toLowerCase()];
            if (matchedClientId) {
                finalClientId = matchedClientId;
            }
        } catch (e) {
            console.error("Error looking up client by address:", e);
        }
    }

    // After attempting to find a client, we must have one.
    if (!finalClientId) {
        return {
            errors: { clientId: ["A client must be selected, or one must be found via a known wallet address."] },
            message: 'Failed to create transaction. Client is required.',
        };
    }
    dataToSave.clientId = finalClientId;
    
    let isBlacklisted = false;
    const clientAddress = dataToSave.client_wallet_address;
    if (clientAddress) {
        try {
            const blacklistSnapshot = await get(ref(db, 'blacklist'));
            if (blacklistSnapshot.exists()) {
                const blacklistItems: BlacklistItem[] = Object.values(blacklistSnapshot.val());
                const addressToCheck = clientAddress.toLowerCase();
                const addressBlacklist = blacklistItems.filter(item => item.type === 'Address');

                for (const item of addressBlacklist) {
                    if (addressToCheck === item.value.toLowerCase()) {
                        isBlacklisted = true;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error("Blacklist check for transaction failed:", e);
        }
    }

    if (isBlacklisted) {
        if (!dataToSave.flags) dataToSave.flags = [];
        if (!dataToSave.flags.includes('Blacklisted')) {
            dataToSave.flags.push('Blacklisted');
        }
    }
    
    if (transactionId && !dataToSave.attachment_url) {
        const transactionRef = ref(db, `transactions/${transactionId}`);
        const snapshot = await get(transactionRef);
        const existingData = snapshot.val();
        dataToSave.attachment_url = existingData?.attachment_url;
    }


    let clientName = '';
    try {
        const clientRef = ref(db, `clients/${dataToSave.clientId}`);
        const snapshot = await get(clientRef);
        if (snapshot.exists()) {
            clientName = (snapshot.val() as Client).name;
        }
    } catch (e) {
        console.error("Could not fetch client name for transaction");
    }

    let bankAccountName = '';
    if (dataToSave.bankAccountId) {
        try {
            const bankAccountRef = ref(db, `accounts/${dataToSave.bankAccountId}`);
            const snapshot = await get(bankAccountRef);
            if (snapshot.exists()) {
                bankAccountName = (snapshot.val() as Account).name;
            }
        } catch (e) {
            console.error("Could not fetch bank account name for transaction");
        }
    }

    let cryptoWalletName = '';
    if (dataToSave.cryptoWalletId) {
        try {
            const cryptoWalletRef = ref(db, `accounts/${dataToSave.cryptoWalletId}`);
            const snapshot = await get(cryptoWalletRef);
            if (snapshot.exists()) {
                cryptoWalletName = (snapshot.val() as Account).name;
            }
        } catch (e) {
            console.error("Could not fetch crypto wallet name for transaction");
        }
    }

    const finalData = {
        ...dataToSave,
        clientName,
        bankAccountName,
        cryptoWalletName,
    };
    
    const dataForFirebase = stripUndefined(finalData);

    try {
        if (transactionId) {
            const transactionRef = ref(db, `transactions/${transactionId}`);
            await update(transactionRef, dataForFirebase);
        } else {
            const newTransactionRef = ref(db, `transactions/${newId}`);
            await set(newTransactionRef, {
                ...dataForFirebase,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        return {
            message: 'Database Error: Failed to create transaction.'
        }
    }

    if (finalData.type === 'Deposit' && finalData.status === 'Confirmed' && finalData.client_wallet_address) {
        try {
            const clientRef = ref(db, `clients/${finalData.clientId}`);
            const clientSnapshot = await get(clientRef);
            if (clientSnapshot.exists()) {
                const clientData = clientSnapshot.val() as Client;
                const existingAddresses = clientData.bep20_addresses || [];
                const newAddress = finalData.client_wallet_address;

                if (!existingAddresses.includes(newAddress)) {
                    const updatedAddresses = [...existingAddresses, newAddress];
                    await update(clientRef, { bep20_addresses: updatedAddresses });
                }
            }
        } catch (e) {
            console.error(`Failed to update BEP20 address for client ${finalData.clientId}:`, e);
        }
    }
    
    if (finalData.status === 'Confirmed' && finalData.bankAccountId && finalData.clientId) {
        try {
            const clientRef = ref(db, `clients/${finalData.clientId}`);
            await update(clientRef, { 
                favoriteBankAccountId: finalData.bankAccountId,
                favoriteBankAccountName: bankAccountName 
            });
        } catch (e) {
            console.error(`Failed to update favorite bank account for client ${finalData.clientId}:`, e);
        }
    }

    // Link SMS if provided
    const { linkedSmsId } = finalData;
    if (linkedSmsId) {
        try {
            const smsTxRef = ref(db, `sms_transactions/${linkedSmsId}`);
            const smsUpdateData = {
                status: 'used' as const,
                transaction_id: newId,
            };
            await update(smsTxRef, smsUpdateData);
        } catch (e) {
            // Log this but don't fail the whole transaction
            console.error(`Failed to update linked SMS transaction ${linkedSmsId}:`, e);
        }
    }

    const _createFeeExpenseJournalEntry = async (
        debitAccountId: string,
        creditAccountId: string,
        amountUsd: number,
        description: string
    ) => {
        if (amountUsd <= 0) return;

        try {
            const [debitSnapshot, creditSnapshot, settingsSnapshot] = await Promise.all([
                get(ref(db, `accounts/${debitAccountId}`)),
                get(ref(db, `accounts/${creditAccountId}`)),
                get(ref(db, 'settings')),
            ]);
            
            if (!debitSnapshot.exists() || !creditSnapshot.exists() || !settingsSnapshot.exists()) {
                return;
            }

            const debitAccount = { id: debitAccountId, ...debitSnapshot.val() } as Account;
            const creditAccount = { id: creditAccountId, ...creditSnapshot.val() } as Account;
            const settings = settingsSnapshot.val() as Settings;

            const getRate = (currency?: string) => {
                if (!currency || !settings) return 1;
                switch(currency) {
                    case 'YER': return settings.yer_usd || 0;
                    case 'SAR': return settings.sar_usd || 0;
                    case 'USDT': return settings.usdt_usd || 1;
                    case 'USD': default: return 1;
                }
            };

            const debitRate = getRate(debitAccount.currency);
            const creditRate = getRate(creditAccount.currency);
            
            if (debitRate === 0 || creditRate === 0) {
                 return;
            }

            const debitAmount = amountUsd / debitRate;
            const creditAmount = amountUsd / creditRate;

            const newEntryRef = push(ref(db, 'journal_entries'));
            await set(newEntryRef, {
                date: finalData.date, // Use transaction date
                description,
                debit_account: debitAccountId,
                credit_account: creditAccountId,
                debit_amount: debitAmount,
                credit_currency: creditAccount.currency || 'USD',
                credit_amount: creditAmount,
                debit_currency: debitAccount.currency || 'USD',
                amount_usd: amountUsd,
                debit_account_name: debitAccount.name,
                credit_account_name: creditAccount.name,
                createdAt: new Date().toISOString(),
            });
        } catch (e) {
            console.error("Failed to create automated journal entry:", e);
        }
    };
    
    if (finalData.fee_usd && finalData.fee_usd > 0) {
        const description = `Profit from transaction ${newId}`;
        if (finalData.type === 'Deposit' && finalData.bankAccountId) {
            await _createFeeExpenseJournalEntry(finalData.bankAccountId, PROFIT_ACCOUNT_ID, finalData.fee_usd, description);
        } else if (finalData.type === 'Withdraw' && finalData.cryptoWalletId) {
            await _createFeeExpenseJournalEntry(finalData.cryptoWalletId, PROFIT_ACCOUNT_ID, finalData.fee_usd, description);
        }
    }
    
    if (finalData.expense_usd && finalData.expense_usd > 0) {
        const description = `Expense from transaction ${newId}`;
        if (finalData.type === 'Deposit' && finalData.cryptoWalletId) {
            await _createFeeExpenseJournalEntry(EXPENSE_ACCOUNT_ID, finalData.cryptoWalletId, finalData.expense_usd, description);
        } else if (finalData.type === 'Withdraw' && finalData.bankAccountId) {
            await _createFeeExpenseJournalEntry(EXPENSE_ACCOUNT_ID, finalData.bankAccountId, finalData.expense_usd, description);
        }
    }
    
    revalidatePath('/transactions');
    revalidatePath('/accounting/journal');
    revalidatePath(`/transactions/${newId}/edit`);
    redirect(`/transactions/${newId}/edit`);
}

// --- Chart of Accounts Actions ---

export type AccountFormState =
  | {
      errors?: {
        id?: string[];
        name?: string[];
        type?: string[];
        currency?: string[];
      };
      message?: string;
    }
  | undefined;

const AccountSchema = z.object({
  id: z.string().regex(/^[0-9]+$/, { message: "Account code must be numeric." }),
  name: z.string().min(1, { message: "Account name is required." }),
  type: z.enum(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses']),
  isGroup: z.boolean().default(false),
  parentId: z.string().optional().nullable(),
  currency: z.enum(['USD', 'YER', 'SAR', 'USDT', 'none']).optional().nullable(),
});

export async function createAccount(accountId: string | null, prevState: AccountFormState, formData: FormData) {
    const parentIdValue = formData.get('parentId');
    const currencyValue = formData.get('currency');

    const rawData = {
        id: accountId ?? formData.get('id'),
        name: formData.get('name'),
        type: formData.get('type'),
        isGroup: formData.get('isGroup') === 'on',
        parentId: parentIdValue === 'none' ? null : parentIdValue,
        currency: currencyValue === 'none' ? null : currencyValue,
    };

    const validatedFields = AccountSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save account. Please check the fields.',
        };
    }

    const { id, ...data } = validatedFields.data;

    if (!id) {
        return {
            errors: { id: ["Account code is required."] },
            message: 'Failed to save account.',
        };
    }

    const dataForFirebase = stripUndefined(data);

    try {
        const accountRef = ref(db, `accounts/${id}`);
        if(accountId) {
             await update(accountRef, dataForFirebase);
        } else {
            const accountsSnapshot = await get(ref(db, 'accounts'));
            const count = accountsSnapshot.exists() ? accountsSnapshot.size : 0;
            const newAccountRef = ref(db, `accounts/${id}`)
            await set(newAccountRef, {
                ...dataForFirebase,
                priority: count, // Assign priority at the end
            });
        }
    } catch (error) {
        return { message: 'Database Error: Failed to save account.' }
    }
    
    revalidatePath('/accounting/chart-of-accounts');
    redirect('/accounting/chart-of-accounts');
}

export async function deleteAccount(accountId: string) {
    if (!accountId) {
        return { message: 'Invalid account ID.' };
    }
    try {
        const accountRef = ref(db, `accounts/${accountId}`);
        await remove(accountRef);
        revalidatePath('/accounting/chart-of-accounts');
        return { success: true };
    } catch (error) {
        return { message: 'Database Error: Failed to delete account.' };
    }
}

export async function updateAccountPriority(accountId: string, parentId: string | null, direction: 'up' | 'down') {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (!snapshot.exists()) return;

    const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
    
    // Filter for sibling accounts
    const siblingAccounts = allAccounts.filter(acc => (acc.parentId || null) === (parentId || null));

    // Ensure all siblings have a priority number for sorting. This makes the system resilient.
    let maxPriority = -1;
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority === 'number' && acc.priority > maxPriority) {
        maxPriority = acc.priority;
      }
    });
    
    const updates: { [key: string]: any } = {};
    // Assign priorities to any account that is missing one.
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority !== 'number') {
        maxPriority++;
        acc.priority = maxPriority; // Update local object for sorting
        updates[`/accounts/${acc.id}/priority`] = acc.priority; // And prepare to persist it
      }
    });

    // If we had to assign new priorities, save them first before proceeding.
    if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
    }
    
    // Sort siblings by their now-guaranteed priority
    siblingAccounts.sort((a, b) => a.priority! - b.priority!);

    const currentIndex = siblingAccounts.findIndex(acc => acc.id === accountId);
    if (currentIndex === -1) return;

    let otherIndex = -1;
    if (direction === 'up' && currentIndex > 0) {
        otherIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < siblingAccounts.length - 1) {
        otherIndex = currentIndex + 1;
    }
    
    if (otherIndex !== -1) {
        const currentAccount = siblingAccounts[currentIndex];
        const otherAccount = siblingAccounts[otherIndex];
        
        // Swap priorities
        const priorityUpdates: { [key: string]: any } = {};
        priorityUpdates[`/accounts/${currentAccount.id}/priority`] = otherAccount.priority;
        priorityUpdates[`/accounts/${otherAccount.id}/priority`] = currentAccount.priority;
        
        try {
            await update(ref(db), priorityUpdates);
        } catch (error) {
            console.error("Failed to update priority:", error);
        }
    }
    
    revalidatePath('/accounting/chart-of-accounts');
}



// --- BscScan Sync Action ---
export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

export async function syncBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    try {
        const settingsSnapshot = await get(ref(db, 'settings'));
        if (!settingsSnapshot.exists()) {
            return { message: 'Settings not found. Please configure API key and wallet address.', error: true };
        }
        const settings: Settings = settingsSnapshot.val();
        const { bsc_api_key, bsc_wallet_address } = settings;

        if (!bsc_api_key || !bsc_wallet_address) {
            return { message: 'BscScan API Key or Wallet Address is not set in Settings.', error: true };
        }
        
        const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${bsc_wallet_address}&page=1&offset=200&sort=desc&apikey=${bsc_api_key}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            return { message: `BscScan API request failed: ${response.statusText}`, error: true };
        }
        const data = await response.json();
        
        if (data.status !== "1") {
            return { message: `BscScan API Error: ${data.message}`, error: true };
        }

        const transactionsSnapshot = await get(ref(db, 'transactions'));
        const existingTxs = transactionsSnapshot.val() || {};
        const existingHashes = new Set(Object.values(existingTxs).map((tx: any) => tx.hash));

        const clientsSnapshot = await get(ref(db, 'clients'));
        const clientsData: Record<string, Client> = clientsSnapshot.val() || {};
        const addressToClientMap: Record<string, { id: string, name: string }> = {};
        for (const clientId in clientsData) {
            const client = clientsData[clientId];
            if (client.bep20_addresses) {
                for (const address of client.bep20_addresses) {
                    addressToClientMap[address.toLowerCase()] = { id: clientId, name: client.name };
                }
            }
        }

        let newTxCount = 0;
        const updates: { [key: string]: any } = {};

        const walletAccountRef = ref(db, 'accounts/1003');
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';


        for (const tx of data.result) {
            if (existingHashes.has(tx.hash)) {
                continue;
            }

            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);

            if (syncedAmount <= 0.01) {
                continue;
            }

            const transactionType = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase() ? 'Withdraw' : 'Deposit';
            const clientAddress = transactionType === 'Withdraw' ? tx.from : tx.to;
            const foundClient = addressToClientMap[clientAddress.toLowerCase()];

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = transactionType === 'Withdraw' 
                ? `Synced from BscScan. From: ${tx.from}` 
                : `Synced from BscScan. To: ${tx.to}`;

            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
                cryptoWalletName: cryptoWalletName,
                amount: syncedAmount,
                currency: 'USDT',
                amount_usd: syncedAmount,
                fee_usd: 0,
                expense_usd: 0,
                amount_usdt: syncedAmount,
                hash: tx.hash,
                status: 'Confirmed',
                notes: note,
                client_wallet_address: clientAddress,
                createdAt: new Date().toISOString(),
                flags: [],
            };
            updates[`/transactions/${newTxId}`] = stripUndefined(newTxData);
            newTxCount++;
        }

        if (newTxCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        return { message: `${newTxCount} new transaction(s) were successfully synced.`, error: false };

    } catch (error: any) {
        console.error("BscScan Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}

// --- Client Import Action ---
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

// --- Blacklist Actions ---
export type BlacklistFormState = { message?: string } | undefined;
export type ScanState = { message?: string; error?: boolean; } | undefined;

const BlacklistItemSchema = z.object({
    type: z.enum(['Name', 'Phone', 'Address']),
    value: z.string().min(1, { message: 'Value is required.' }),
    reason: z.string().optional(),
});

export async function addBlacklistItem(formData: FormData): Promise<BlacklistFormState> {
    const validatedFields = BlacklistItemSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.value?.[0] || 'Invalid data.' };
    }

    try {
        const newRef = push(ref(db, 'blacklist'));
        await set(newRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/blacklist');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to add item.' };
    }
}

export async function deleteBlacklistItem(id: string): Promise<BlacklistFormState> {
    try {
        await remove(ref(db, `blacklist/${id}`));
        revalidatePath('/blacklist');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to delete item.' };
    }
}

export async function scanClientsWithBlacklist(prevState: ScanState, formData: FormData): Promise<ScanState> {
    try {
        const [clientsSnapshot, blacklistSnapshot] = await Promise.all([
            get(ref(db, 'clients')),
            get(ref(db, 'blacklist'))
        ]);

        if (!clientsSnapshot.exists() || !blacklistSnapshot.exists()) {
            return { message: "No clients or blacklist items to scan.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        const blacklistItems: BlacklistItem[] = Object.values(blacklistSnapshot.val());

        const nameBlacklist = blacklistItems.filter(item => item.type === 'Name');
        const phoneBlacklist = blacklistItems.filter(item => item.type === 'Phone');
        
        let flaggedCount = 0;
        const updates: { [key: string]: any } = {};

        for (const clientId in clientsData) {
            const client = { id: clientId, ...clientsData[clientId] };
            let needsUpdate = false;
            let currentFlags = client.review_flags || [];
            
            // Check against name blacklist
            for (const item of nameBlacklist) {
                const clientWords = new Set(client.name.toLowerCase().split(/\s+/));
                const blacklistWords = item.value.toLowerCase().split(/\s+/);

                if (blacklistWords.every(word => clientWords.has(word))) {
                    if (!currentFlags.includes('Blacklisted')) {
                        currentFlags.push('Blacklisted');
                        needsUpdate = true;
                    }
                    break;
                }
            }
            
            // Check against phone blacklist
            for (const item of phoneBlacklist) {
                if (client.phone?.includes(item.value)) {
                    if (!currentFlags.includes('Blacklisted')) {
                        currentFlags.push('Blacklisted');
                        needsUpdate = true;
                    }
                    break;
                }
            }

            if (needsUpdate) {
                updates[`/clients/${clientId}/review_flags`] = currentFlags;
                flaggedCount++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/clients');
        return { message: `Scan complete. Scanned ${Object.keys(clientsData).length} clients and flagged ${flaggedCount} new clients.`, error: false };

    } catch (error: any) {
        console.error("Blacklist Scan Error:", error);
        return { message: error.message || "An unknown error occurred during the scan.", error: true };
    }
}

// --- Bank Account Actions ---
export type BankAccountFormState =
| {
    errors?: {
        name?: string[];
        account_number?: string[];
        currency?: string[];
        status?: string[];
    };
    message?: string;
    }
| undefined;

const BankAccountSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    account_number: z.string().optional(),
    currency: z.enum(['USD', 'YER', 'SAR']),
    status: z.enum(['Active', 'Inactive']),
});

export async function createBankAccount(accountId: string | null, prevState: BankAccountFormState, formData: FormData) {
    const validatedFields = BankAccountSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save bank account. Please check the fields.',
        };
    }

    const data = validatedFields.data;
    const dataForFirebase = stripUndefined(data);

    try {
        if (accountId) {
            const accountRef = ref(db, `bank_accounts/${accountId}`);
            await update(accountRef, dataForFirebase);
        } else {
            const newAccountRef = push(ref(db, 'bank_accounts'));
            const snapshot = await get(ref(db, 'bank_accounts'));
            const count = snapshot.exists() ? snapshot.size : 0;
            
            await set(newAccountRef, {
                ...dataForFirebase,
                priority: count,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        return { message: 'Database Error: Failed to save bank account.' }
    }
    
    revalidatePath('/bank-accounts');
    redirect('/bank-accounts');
}

export async function updateBankAccountPriority(accountId: string, direction: 'up' | 'down') {
    const accountsRef = ref(db, 'bank_accounts');
    const snapshot = await get(accountsRef);
    if (!snapshot.exists()) return;

    let accounts: BankAccount[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));

    // Assign default priority if missing, to handle legacy data
    accounts.forEach((acc, index) => {
        if (acc.priority === undefined || acc.priority === null) {
            acc.priority = index;
        }
    });

    accounts.sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const currentIndex = accounts.findIndex(acc => acc.id === accountId);
    if (currentIndex === -1) return;

    let otherIndex = -1;
    if (direction === 'up' && currentIndex > 0) {
        otherIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < accounts.length - 1) {
        otherIndex = currentIndex + 1;
    }
    
    if (otherIndex !== -1) {
        // Swap priorities
        const currentAccount = accounts[currentIndex];
        const otherAccount = accounts[otherIndex];
        
        const updates: { [key: string]: any } = {};
        updates[`/bank_accounts/${currentAccount.id}/priority`] = otherAccount.priority;
        updates[`/bank_accounts/${otherAccount.id}/priority`] = currentAccount.priority;
        
        try {
            await update(ref(db), updates);
        } catch (error) {
            console.error("Failed to update priority:", error);
            // Optionally return an error state
        }
    }
    
    revalidatePath('/bank-accounts');
}

// --- SMS Processing Actions ---
export async function updateSmsTransactionStatus(id: string, status: SmsTransaction['status']): Promise<{success: boolean, message?: string}> {
    if (!id || !status) {
        return { success: false, message: 'Invalid ID or status provided.' };
    }
    try {
        const txRef = ref(db, `sms_transactions/${id}`);
        await update(txRef, { status });
        revalidatePath('/sms/transactions');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Database error: Failed to update status.' };
    }
}

export async function matchSmsTransaction(smsId: string): Promise<{success: boolean, message?: string}> {
    if (!smsId) {
        return { success: false, message: 'Invalid SMS ID provided.' };
    }
    try {
        const txRef = ref(db, `sms_transactions/${smsId}`);
        const snapshot = await get(txRef);
        if (!snapshot.exists()) {
            return { success: false, message: 'SMS transaction not found.' };
        }
        const currentStatus = snapshot.val().status;
        if (currentStatus !== 'pending') {
            return { success: false, message: `Cannot match SMS. Status is already '${currentStatus}'.` };
        }
        await update(txRef, { status: 'matched' });
        // No revalidate here to prevent form reload
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Database error: Failed to update status.' };
    }
}

export type ProcessSmsState = { message?: string; error?: boolean; } | undefined;

export type SmsEndpointState = { message?: string; error?: boolean; } | undefined;

export async function createSmsEndpoint(prevState: SmsEndpointState, formData: FormData): Promise<SmsEndpointState> {
    const accountId = formData.get('accountId') as string;
    if (!accountId) {
        return { message: 'Account selection is required.', error: true };
    }

    try {
        const accountSnapshot = await get(ref(db, `accounts/${accountId}`));
        if (!accountSnapshot.exists()) {
            return { message: 'Selected account not found.', error: true };
        }
        const accountName = (accountSnapshot.val() as Account).name;

        const newEndpointRef = push(ref(db, 'sms_endpoints'));
        await set(newEndpointRef, {
            accountId,
            accountName,
            createdAt: new Date().toISOString(),
        });

        revalidatePath('/sms/settings');
        return { message: 'Endpoint created successfully.' };

    } catch (error) {
        console.error('Create SMS Endpoint Error:', error);
        return { message: 'Database Error: Failed to create endpoint.', error: true };
    }
}

export async function deleteSmsEndpoint(endpointId: string): Promise<SmsEndpointState> {
    if (!endpointId) {
        return { message: 'Endpoint ID is required.', error: true };
    }
    try {
        await remove(ref(db, `sms_endpoints/${endpointId}`));
        revalidatePath('/sms/settings');
        return { message: 'Endpoint deleted successfully.' };
    } catch (error) {
        console.error('Delete SMS Endpoint Error:', error);
        return { message: 'Database Error: Failed to delete endpoint.', error: true };
    }
}

export async function processIncomingSms(prevState: ProcessSmsState, formData: FormData): Promise<ProcessSmsState> {
    const incomingSmsRef = ref(db, 'incoming');
    const smsEndpointsRef = ref(db, 'sms_endpoints');
    const chartOfAccountsRef = ref(db, 'accounts');
    const transactionsRef = ref(db, 'sms_transactions');
    const settingsRef = ref(db, 'settings');
    const rulesRef = ref(db, 'sms_parsing_rules');

    try {
        const [incomingSnapshot, endpointsSnapshot, accountsSnapshot, settingsSnapshot, smsTransactionsSnapshot, rulesSnapshot] = await Promise.all([
            get(incomingSmsRef),
            get(smsEndpointsRef),
            get(chartOfAccountsRef),
            get(settingsRef),
            get(smsTransactionsSnapshot),
            get(rulesRef),
        ]);

        if (!incomingSnapshot.exists()) {
            return { message: "No new SMS messages to process.", error: false };
        }
        
        const allIncoming = incomingSnapshot.val();
        const allEndpoints: Record<string, { accountId: string, accountName: string }> = endpointsSnapshot.val() || {};
        const allChartOfAccounts: Record<string, Account> = accountsSnapshot.val() || {};
        const settings: Settings | null = settingsSnapshot.val();
        const customRules: SmsParsingRule[] = rulesSnapshot.exists() ? Object.values(rulesSnapshot.val()) : [];
        
        // Create a set of recent SMS bodies for quick duplicate checking
        const allSmsTransactions: SmsTransaction[] = smsTransactionsSnapshot.exists() ? Object.values(smsTransactionsSnapshot.val()) : [];
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentSmsBodies = new Set(
            allSmsTransactions
                .filter(tx => new Date(tx.parsed_at).getTime() > twentyFourHoursAgo)
                .map(tx => tx.raw_sms.trim()) // Store trimmed version for consistent matching
        );
        
        const updates: { [key: string]: any } = {};
        let processedCount = 0;
        let duplicateCount = 0;
        let customSuccessCount = 0;
        let regexSuccessCount = 0;
        let aiSuccessCount = 0;
        let failedCount = 0;

        const processMessageAndUpdate = async (payload: any, endpointId: string, messageId?: string) => {
            const endpointMapping = allEndpoints[endpointId];
            
            // Always remove the message from the incoming queue
            if (messageId) {
                updates[`/incoming/${endpointId}/${messageId}`] = null;
            } else {
                 updates[`/incoming/${endpointId}`] = null;
            }

            if (!endpointMapping) return;

            const accountId = endpointMapping.accountId;
            const account = allChartOfAccounts[accountId];
            
            if (!account || !account.currency) return; // Skip if account or its currency isn't defined

            let smsBody: string;
            if (typeof payload === 'object' && payload !== null) {
                smsBody = payload.body || payload.message || payload.text || '';
            } else {
                smsBody = String(payload);
            }
            
            const trimmedSmsBody = smsBody.trim();
            if (trimmedSmsBody === '') return;
            
            // Check for duplicates based on the entire message body within the last 24 hours
            if (recentSmsBodies.has(trimmedSmsBody)) {
                duplicateCount++;
                return; // Skip processing
            }

            processedCount++;
            const newTxId = push(transactionsRef).key;
            if (!newTxId) return;

            let parsed: ParsedSms | null = null;
            
            // Stage 1: Custom Rules
            if (customRules.length > 0) {
                parsed = parseSmsWithCustomRules(trimmedSmsBody, customRules);
                if (parsed) customSuccessCount++;
            }

            // Stage 2: Static Regex Parser
            if (!parsed) {
                parsed = parseSms(trimmedSmsBody);
                if (parsed) regexSuccessCount++;
            }
            
            // Stage 3: AI Parser (if everything else fails)
            if (!parsed) {
                parsed = await parseSmsWithAi(trimmedSmsBody, settings?.gemini_api_key || '');
                if (parsed) aiSuccessCount++;
            }
            
            if (parsed) {
                updates[`/sms_transactions/${newTxId}`] = {
                    client_name: parsed.person,
                    account_id: accountId,
                    account_name: account.name,
                    amount: parsed.amount,
                    currency: account.currency, // Use currency from the account
                    type: parsed.type,
                    status: 'pending',
                    parsed_at: new Date().toISOString(),
                    raw_sms: trimmedSmsBody, // Store the trimmed version
                };
                // Add to set to prevent processing duplicates in the same run
                recentSmsBodies.add(trimmedSmsBody);
            } else {
                failedCount++;
                updates[`/sms_transactions/${newTxId}`] = {
                    client_name: 'Parsing Failed',
                    account_id: accountId,
                    account_name: account.name,
                    amount: null,
                    currency: account.currency,
                    type: null,
                    status: 'rejected',
                    parsed_at: new Date().toISOString(),
                    raw_sms: trimmedSmsBody,
                };
            }
        };

        for (const endpointId in allIncoming) {
            const messagesNode = allIncoming[endpointId];
            
            if (typeof messagesNode === 'object' && messagesNode !== null) {
                const messagePromises = Object.keys(messagesNode).map(messageId => 
                    processMessageAndUpdate(messagesNode[messageId], endpointId, messageId)
                );
                await Promise.all(messagePromises);
            } else if (typeof messagesNode === 'string') {
                await processMessageAndUpdate(messagesNode, endpointId);
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/sms/transactions');
        let message = `Processed ${processedCount} message(s): ${customSuccessCount} by custom, ${regexSuccessCount} by regex, ${aiSuccessCount} by AI, ${failedCount} failed.`;
        if (duplicateCount > 0) {
            message += ` Skipped ${duplicateCount} duplicate message(s).`;
        }
        return { message, error: failedCount > 0 };

    } catch(error: any) {
        console.error("SMS Processing Error:", error);
        return { message: error.message || "An unknown error occurred during SMS processing.", error: true };
    }
}

// --- Client Merge Action ---
export type MergeState = { message?: string; error?: boolean; } | undefined;

export async function mergeDuplicateClients(prevState: MergeState, formData: FormData): Promise<MergeState> {
    try {
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);

        if (!clientsSnapshot.exists()) {
            return { message: "No clients found to merge.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        
        const clientsByName: Record<string, Client[]> = {};

        // Group clients by a normalized name
        for (const clientId in clientsData) {
            const client = { id: clientId, ...clientsData[clientId] };
            const normalizedName = client.name.trim().toLowerCase();
            
            if (!clientsByName[normalizedName]) {
                clientsByName[normalizedName] = [];
            }
            clientsByName[normalizedName].push(client);
        }

        const updates: { [key: string]: any } = {};
        let mergedGroups = 0;
        let deletedClients = 0;

        for (const name in clientsByName) {
            const group = clientsByName[name];
            if (group.length > 1) {
                mergedGroups++;

                group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                
                const primaryClient = group[0];
                const duplicates = group.slice(1);
                
                const allPhones = new Set(Array.isArray(primaryClient.phone) ? primaryClient.phone : [primaryClient.phone].filter(Boolean));
                const allKycDocs = new Map(primaryClient.kyc_documents?.map(doc => [doc.url, doc]) || []);
                const allBep20 = new Set(primaryClient.bep20_addresses || []);

                for (const dup of duplicates) {
                    deletedClients++;
                    (Array.isArray(dup.phone) ? dup.phone : [dup.phone]).forEach(p => p && allPhones.add(p));
                    (dup.bep20_addresses || []).forEach(a => allBep20.add(a));
                    (dup.kyc_documents || []).forEach(doc => {
                        if (!allKycDocs.has(doc.url)) {
                            allKycDocs.set(doc.url, doc);
                        }
                    });
                    
                    updates[`/clients/${dup.id}`] = null;
                };

                updates[`/clients/${primaryClient.id}/phone`] = Array.from(allPhones);
                updates[`/clients/${primaryClient.id}/bep20_addresses`] = Array.from(allBep20);
                updates[`/clients/${primaryClient.id}/kyc_documents`] = Array.from(allKycDocs.values());
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/clients');
        return { message: `Merge complete. Merged ${mergedGroups} groups of clients and removed ${deletedClients} duplicates.`, error: false };

    } catch (error: any) {
        console.error("Client Merge Error:", error);
        return { message: error.message || "An unknown error occurred during the merge.", error: true };
    }
}


// --- SMS Parsing Rule Actions ---
export type ParsingRuleFormState = { message?: string } | undefined;

const SmsParsingRuleSchema = z.object({
    name: z.string().min(1, { message: 'Rule name is required.' }),
    type: z.enum(['credit', 'debit']),
    amountStartsAfter: z.string().min(1, { message: 'This marker is required.' }),
    amountEndsBefore: z.string().min(1, { message: 'This marker is required.' }),
    personStartsAfter: z.string().min(1, { message: 'This marker is required.' }),
    personEndsBefore: z.string().min(1, { message: 'This marker is required.' }),
});

export async function createSmsParsingRule(formData: FormData): Promise<ParsingRuleFormState> {
    const validatedFields = SmsParsingRuleSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.name?.[0] || 'Invalid data.' };
    }

    try {
        const newRef = push(ref(db, 'sms_parsing_rules'));
        await set(newRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to save rule.' };
    }
}

export async function deleteSmsParsingRule(id: string): Promise<ParsingRuleFormState> {
    if (!id) return { message: 'Invalid ID.' };
    try {
        await remove(ref(db, `sms_parsing_rules/${id}`));
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to delete rule.' };
    }
}

    
