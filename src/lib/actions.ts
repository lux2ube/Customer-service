

'use server';

import { z } from 'zod';
import { db, storage } from './firebase';
import { push, ref, set, update, get, remove, query, orderByChild, equalTo, startAt } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, KycDocument, BlacklistItem, BankAccount, SmsTransaction, ParsedSms, SmsParsingRule, SmsEndpoint, NameMatchingRule, TransactionFlag } from './types';
import { parseSmsWithCustomRules } from './custom-sms-parser';
import { normalizeArabic } from './utils';
import { redirect } from 'next/navigation';
import { parseSmsWithAi } from '@/ai/flows/parse-sms-flow';


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
    credit_amount: z.coerce.number().gt(0, { message: 'Credit amount must be positive.' }),
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

    const { date, description, debit_account, credit_account, debit_amount, credit_amount, amount_usd } = validatedFields.data;

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
            credit_amount,
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
      success?: boolean;
      transactionId?: string;
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
}).refine(data => {
    if (data.hash && data.status === 'Confirmed') {
        return data.amount > 0;
    }
    return true;
}, {
    message: "Amount must be filled in for a confirmed BscScan transaction.",
    path: ["amount"],
});


export async function createTransaction(transactionId: string | null, formData: FormData): Promise<TransactionFormState> {
    const newId = transactionId || push(ref(db, 'transactions')).key;
    if (!newId) throw new Error("Could not generate a transaction ID.");

    const attachmentFile = formData.get('attachment_url_input') as File | null;
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

    const dataToValidate = {
        ...Object.fromEntries(formData.entries()),
        flags: formData.getAll('flags'),
        attachment_url: attachmentUrlString,
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

    const { linkedSmsId } = finalData;
    if (linkedSmsId) {
        try {
            const smsTxRef = ref(db, `sms_transactions/${linkedSmsId}`);
             const smsSnapshot = await get(smsTxRef);
            if (smsSnapshot.exists()) {
                const smsUpdateData = {
                    status: 'used' as const,
                    transaction_id: newId,
                };
                await update(smsTxRef, smsUpdateData);
            }
        } catch (e) {
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
                console.error("Could not create journal entry: one or more accounts or settings not found.");
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
                 console.error("Could not create journal entry: zero conversion rate.");
                 return;
            }

            const debitAmount = amountUsd / debitRate;
            const creditAmount = amountUsd / creditRate;

            const newEntryRef = push(ref(db, 'journal_entries'));
            await set(newEntryRef, {
                date: finalData.date,
                description,
                debit_account: debitAccountId,
                credit_account: creditAccountId,
                debit_amount: debitAmount,
                credit_amount: creditAmount,
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
    
    return { success: true, transactionId: newId };
}

export type BulkUpdateState = { message?: string; error?: boolean } | undefined;

export async function updateBulkTransactions(prevState: BulkUpdateState, formData: FormData): Promise<BulkUpdateState> {
    const transactionIds = formData.getAll('transactionIds') as string[];
    const status = formData.get('status') as Transaction['status'];

    if (!transactionIds || transactionIds.length === 0 || !status) {
        return { message: 'No transactions or status selected.', error: true };
    }

    const updates: { [key: string]: any } = {};
    for (const id of transactionIds) {
        updates[`/transactions/${id}/status`] = status;
    }

    try {
        await update(ref(db), updates);
        revalidatePath('/transactions');
        return { message: `Successfully updated ${transactionIds.length} transactions to "${status}".`, error: false };
    } catch (error) {
        console.error('Bulk update error:', error);
        return { message: 'Database error: Failed to update transactions.', error: true };
    }
}


export async function getSmsSuggestions(clientId: string, bankAccountId: string): Promise<SmsTransaction[]> {
    if (!clientId || !bankAccountId) {
        return [];
    }

    try {
        const [smsSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, 'sms_transactions')),
            get(ref(db, `clients/${clientId}`))
        ]);

        if (!smsSnapshot.exists() || !clientSnapshot.exists()) {
            return [];
        }

        const allSmsTxs: SmsTransaction[] = Object.keys(smsSnapshot.val()).map(key => ({ id: key, ...smsSnapshot.val()[key] }));
        const client = clientSnapshot.val() as Client;
        
        const suggestions = allSmsTxs.filter(sms => {
            if (sms.account_id !== bankAccountId) return false;
            
            const isAvailable = sms.status === 'parsed' || sms.status === 'matched';
            if (!isAvailable) return false;

            if (sms.status === 'matched') {
                return sms.matched_client_id === clientId;
            }

            if (sms.client_name) {
                // This simple check will be replaced by the more advanced matching logic.
                const normalizedClientName = normalizeArabic(client.name.toLowerCase());
                const normalizedSmsName = normalizeArabic(sms.client_name.toLowerCase());
                return normalizedClientName.includes(normalizedSmsName);
            }

            return false;
        });

        return suggestions.sort((a,b) => new Date(b.parsed_at).getTime() - new Date(a.parsed_at).getTime());

    } catch (error) {
        console.error("Error fetching SMS suggestions:", error);
        return [];
    }
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

export async function createAccount(accountId: string | null, formData: FormData) {
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
                priority: count,
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
    
    const siblingAccounts = allAccounts.filter(acc => (acc.parentId || null) === (parentId || null));

    let maxPriority = -1;
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority === 'number' && acc.priority > maxPriority) {
        maxPriority = acc.priority;
      }
    });
    
    const updates: { [key: string]: any } = {};
    siblingAccounts.forEach(acc => {
      if (typeof acc.priority !== 'number') {
        maxPriority++;
        acc.priority = maxPriority;
        updates[`/accounts/${acc.id}/priority`] = acc.priority;
      }
    });

    if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
    }
    
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
            // Provide more informative error message for known API responses
            if (data.message === "No transactions found") {
                return { message: "No new transactions found on BscScan.", error: false };
            }
             if (data.message === "Query Timeout" || (data.result && data.result.includes("Max rate limit reached"))) {
                return { message: "BscScan API rate limit reached. Please wait a moment and try again.", error: true };
            }
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

            const isIncoming = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase();
            const transactionType = isIncoming ? 'Withdraw' : 'Deposit';
            const clientAddress = isIncoming ? tx.from : tx.to;
            const foundClient = addressToClientMap[clientAddress.toLowerCase()];

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = `Synced from BscScan. From: ${tx.from}. To: ${tx.to}`;

            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
                cryptoWalletName: cryptoWalletName,
                amount: 0,
                currency: 'USDT',
                amount_usd: syncedAmount,
                fee_usd: 0,
                expense_usd: 0,
                amount_usdt: syncedAmount,
                hash: tx.hash,
                status: 'Pending',
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

export async function syncHistoricalBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
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

        const transactionsSnapshot = await get(ref(db, 'transactions'));
        const existingHashes = new Set(Object.values(transactionsSnapshot.val() || {}).map((tx: any) => tx.hash));
        
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
        
        const walletAccountRef = ref(db, 'accounts/1003');
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';

        const cutoffDate = new Date('2025-05-25T00:00:00Z');
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
        
        // Get the block number for the cutoff date
        const blockApiUrl = `https://api.bscscan.com/api?module=block&action=getblocknobytime&timestamp=${cutoffTimestamp}&closest=before&apikey=${bsc_api_key}`;
        const blockResponse = await fetch(blockApiUrl);
        const blockData = await blockResponse.json();
        if (blockData.status !== "1") {
            return { message: `BscScan API Error (getblocknobytime): ${blockData.message}`, error: true };
        }
        const endBlock = blockData.result;

        let page = 1;
        let allNewTransactions: any[] = [];
        let keepFetching = true;

        while (keepFetching) {
            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${bsc_wallet_address}&page=${page}&offset=1000&endblock=${endBlock}&sort=desc&apikey=${bsc_api_key}`;
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`BscScan API request failed: ${response.statusText}`);
            
            const data = await response.json();
            if (data.status !== "1") {
                if (data.message === "No transactions found") break; // Normal end of transactions
                if (data.message === "Query Timeout" || (data.result && data.result.includes("Max rate limit reached"))) {
                   return { message: "BscScan API rate limit reached. Please wait a moment and try again.", error: true };
                }
                 if (data.result?.includes('transactions should be less than 10000')) {
                    return { message: "API Error: Too many transactions in range. The historical sync needs to be broken into smaller time periods.", error: true };
                }
                throw new Error(`BscScan API Error: ${data.message}`);
            }

            const results = data.result || [];
            if (results.length === 0) {
                keepFetching = false;
                break;
            }

            for (const tx of results) {
                if (!existingHashes.has(tx.hash)) {
                    allNewTransactions.push(tx);
                }
            }

            if (results.length < 1000) {
                 keepFetching = false;
            }

            page++;
            if (page > 10) { // Safety break after 10 pages (10,000 transactions)
                keepFetching = false;
                console.warn("Historical sync stopped after 10 pages to avoid API limits.");
            }
            await new Promise(resolve => setTimeout(resolve, 250)); // Rate limit
        }

        const updates: { [key: string]: any } = {};

        for (const tx of allNewTransactions) {
            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
            if (syncedAmount <= 0.01) continue;

            const isIncoming = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase();
            const transactionType = isIncoming ? 'Withdraw' : 'Deposit';
            const clientAddress = isIncoming ? tx.from : tx.to;
            const foundClient = addressToClientMap[clientAddress.toLowerCase()];

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = `Synced from BscScan. From: ${tx.from}. To: ${tx.to}`;
            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
                cryptoWalletName: cryptoWalletName,
                amount: 0, currency: 'USDT',
                amount_usd: syncedAmount, fee_usd: 0, expense_usd: 0, amount_usdt: syncedAmount,
                hash: tx.hash, status: 'Pending', notes: note,
                client_wallet_address: clientAddress,
                createdAt: new Date().toISOString(), flags: [],
            };
            updates[`/transactions/${newTxId}`] = stripUndefined(newTxData);
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        return { message: `Historical Sync Complete: ${allNewTransactions.length} new transaction(s) were successfully synced.`, error: false };
    } catch (error: any) {
        console.error("BscScan Historical Sync Error:", error);
        return { message: error.message || "An unknown error occurred during historical sync.", error: true };
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
            
            for (const item of nameBlacklist) {
                if (!client.name) continue;
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
            
            for (const item of phoneBlacklist) {
                const clientPhones = Array.isArray(client.phone) ? client.phone : [client.phone];
                if (clientPhones.includes(item.value)) {
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

export async function createBankAccount(accountId: string | null, formData: FormData) {
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
        const currentAccount = accounts[currentIndex];
        const otherAccount = accounts[otherIndex];
        
        const updates: { [key: string]: any } = {};
        updates[`/bank_accounts/${currentAccount.id}/priority`] = otherAccount.priority;
        updates[`/bank_accounts/${otherAccount.id}/priority`] = currentAccount.priority;
        
        try {
            await update(ref(db), updates);
        } catch (error) {
            console.error("Failed to update priority:", error);
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

export async function linkSmsToClient(smsId: string, clientId: string): Promise<{ success: boolean, message?: string }> {
    if (!smsId || !clientId) {
        return { success: false, message: 'Invalid SMS ID or Client ID.' };
    }
    try {
        const clientRef = ref(db, `clients/${clientId}`);
        const clientSnapshot = await get(clientRef);
        if (!clientSnapshot.exists()) {
            return { success: false, message: 'Client not found.' };
        }
        const clientName = (clientSnapshot.val() as Client).name;

        const smsTxRef = ref(db, `sms_transactions/${smsId}`);
        const updateData = {
            status: 'matched' as const,
            matched_client_id: clientId,
            matched_client_name: clientName,
        };
        await update(smsTxRef, updateData);
        revalidatePath('/sms/transactions');
        return { success: true, message: 'SMS linked to client successfully.' };
    } catch (error) {
        console.error('Error linking SMS to client:', error);
        return { success: false, message: 'Database error while linking.' };
    }
}


export type ProcessSmsState = { message?: string; error?: boolean; } | undefined;
export type MatchSmsState = { message?: string; error?: boolean; } | undefined;

export type SmsEndpointState = { message?: string; error?: boolean; } | undefined;

const SmsEndpointSchema = z.object({
  accountId: z.string().min(1, 'Account selection is required.'),
  nameMatchingRules: z.array(z.string()).optional(),
  endpointId: z.string().optional().nullable(),
});

export async function createSmsEndpoint(prevState: SmsEndpointState, formData: FormData): Promise<SmsEndpointState> {
    const dataToValidate = {
        accountId: formData.get('accountId'),
        nameMatchingRules: formData.getAll('nameMatchingRules'),
        endpointId: formData.get('endpointId'),
    };
    
    const validatedFields = SmsEndpointSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return { message: 'Invalid data provided.', error: true };
    }

    const { accountId, nameMatchingRules, endpointId } = validatedFields.data;

    try {
        const accountSnapshot = await get(ref(db, `accounts/${accountId}`));
        if (!accountSnapshot.exists()) {
            return { message: 'Selected account not found.', error: true };
        }
        const accountName = (accountSnapshot.val() as Account).name;
        
        const endpointData = {
            accountId,
            accountName,
            nameMatchingRules,
        };

        if (endpointId) {
            await update(ref(db, `sms_endpoints/${endpointId}`), endpointData);
        } else {
            const newEndpointRef = push(ref(db, 'sms_endpoints'));
            await set(newEndpointRef, {
                ...endpointData,
                createdAt: new Date().toISOString(),
            });
        }

        revalidatePath('/sms/settings');
        return { message: endpointId ? 'Endpoint updated successfully.' : 'Endpoint created successfully.' };

    } catch (error) {
        console.error('Create/Update SMS Endpoint Error:', error);
        return { message: 'Database Error: Failed to save endpoint.', error: true };
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
    const rulesRef = ref(db, 'sms_parsing_rules');

    try {
        const promiseResults = await Promise.all([
            get(incomingSmsRef),
            get(smsEndpointsRef),
            get(chartOfAccountsRef),
            get(transactionsRef),
            get(rulesRef),
        ]);

        const [
            incomingSnapshot,
            endpointsSnapshot,
            accountsSnapshot,
            smsTransactionsSnapshot,
            rulesSnapshot,
        ] = promiseResults;
        

        if (!incomingSnapshot.exists()) {
            return { message: "No new SMS messages to process.", error: false };
        }
        
        const allIncoming = incomingSnapshot.val();
        const allEndpoints: Record<string, SmsEndpoint> = endpointsSnapshot.val() || {};
        const allChartOfAccounts: Record<string, Account> = accountsSnapshot.val() || {};
        const customRules: SmsParsingRule[] = rulesSnapshot.exists() ? Object.values(rulesSnapshot.val()) : [];
        
        const allSmsTransactions: SmsTransaction[] = smsTransactionsSnapshot.exists() ? Object.values(smsTransactionsSnapshot.val()) : [];
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentSmsBodies = new Set(
            allSmsTransactions
                .filter(tx => tx.raw_sms && tx.parsed_at && new Date(tx.parsed_at).getTime() > twentyFourHoursAgo)
                .map(tx => tx.raw_sms.trim())
        );
        
        const updates: { [key: string]: any } = {};
        let processedCount = 0;
        let duplicateCount = 0;
        let successCount = 0;
        let failedCount = 0;

        const processMessageAndUpdate = async (payload: any, endpointId: string, messageId?: string) => {
            const endpointMapping = allEndpoints[endpointId];
            
            if (messageId) {
                updates[`/incoming/${endpointId}/${messageId}`] = null;
            } else {
                 updates[`/incoming/${endpointId}`] = null;
            }

            if (!endpointMapping) return;

            const accountId = endpointMapping.accountId;
            const account = allChartOfAccounts[accountId];
            
            if (!account || !account.currency) return;

            let smsBody: string;
            if (typeof payload === 'object' && payload !== null) {
                smsBody = payload.body || payload.message || payload.text || '';
            } else {
                smsBody = String(payload);
            }
            
            const trimmedSmsBody = smsBody.trim();
            if (trimmedSmsBody === '') return;
            
            if (recentSmsBodies.has(trimmedSmsBody)) {
                duplicateCount++;
                return;
            }

            processedCount++;
            const newTxId = push(transactionsRef).key;
            if (!newTxId) return;

            let parsed: ParsedSms | null = null;
            
            if (customRules.length > 0) {
                parsed = parseSmsWithCustomRules(trimmedSmsBody, customRules);
            }
            
            if (!parsed) {
                const settings = (await get(ref(db, 'settings'))).val() as Settings;
                if (settings?.gemini_api_key) {
                    parsed = await parseSmsWithAi(trimmedSmsBody, settings.gemini_api_key);
                }
            }
            
            if (parsed) {
                successCount++;
                updates[`/sms_transactions/${newTxId}`] = {
                    client_name: parsed.person,
                    account_id: accountId,
                    account_name: account.name,
                    amount: parsed.amount,
                    currency: account.currency,
                    type: parsed.type,
                    status: 'parsed',
                    parsed_at: new Date().toISOString(),
                    raw_sms: trimmedSmsBody,
                };
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
        let message = `Processed ${processedCount} message(s): ${successCount} successfully parsed, ${failedCount} failed.`;
        if (duplicateCount > 0) {
            message += ` Skipped ${duplicateCount} duplicate message(s).`;
        }
        return { message, error: failedCount > 0 };

    } catch(error: any) {
        console.error("SMS Processing Error:", error);
        return { message: error.message || "An unknown error occurred during SMS processing.", error: true };
    }
}

// --- SMS Matching Algorithm Helpers ---
type ClientWithId = Client & { id: string };

const matchByPhoneNumber = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const smsPhone = smsParsedName.replace(/\D/g, '');
    if (!smsPhone) return [];
    
    return clients.filter(client => {
        const clientPhones = (Array.isArray(client.phone) ? client.phone : [client.phone]).filter(Boolean);
        return clientPhones.some(p => p.replace(/\D/g, '').endsWith(smsPhone));
    });
};

const matchByFirstNameAndSecondName = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const normalizedSmsName = normalizeArabic(smsParsedName.toLowerCase()).trim();
    return clients.filter(client => {
        if (!client.name) return false;
        const normalizedClientName = normalizeArabic(client.name.toLowerCase()).trim();
        const clientNameParts = normalizedClientName.split(' ');
        const smsNameParts = normalizedSmsName.split(' ');
        if (smsNameParts.length !== 2) return false;
        return clientNameParts[0] === smsNameParts[0] && clientNameParts[1] === smsNameParts[1];
    });
};

const matchByFullNameOrPartial = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const normalizedSmsName = normalizeArabic(smsParsedName.toLowerCase()).trim();
    return clients.filter(client => {
        if (!client.name) return false;
        const normalizedClientName = normalizeArabic(client.name.toLowerCase()).trim();
        return normalizedClientName.startsWith(normalizedSmsName);
    });
};

const matchByFirstNameAndLastName = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const smsNameParts = normalizeArabic(smsParsedName.toLowerCase()).trim().split(' ');
    if (smsNameParts.length < 2) return [];
    const smsFirst = smsNameParts[0];
    const smsLast = smsNameParts[smsNameParts.length - 1];

    return clients.filter(client => {
        if (!client.name) return false;
        const clientNameParts = normalizeArabic(client.name.toLowerCase()).trim().split(' ');
        if (clientNameParts.length < 2) return false;
        const clientFirst = clientNameParts[0];
        const clientLast = clientNameParts[clientNameParts.length - 1];
        return clientFirst === smsFirst && clientLast === smsLast;
    });
};

const scoreAndSelectBestMatch = (
    matches: ClientWithId[],
    sms: SmsTransaction & { id: string },
    allTransactions: (Transaction & { id: string })[],
): ClientWithId | null => {
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) return null;

    // Prioritized match beats all
    const prioritizedMatch = matches.find(c => c.prioritize_sms_matching);
    if (prioritizedMatch) return prioritizedMatch;

    let scores = matches.map(client => ({
        client,
        score: 0,
        lastUsed: 0
    }));

    // Score based on previous use of bank account
    const clientTxHistory = allTransactions.filter(tx => tx.bankAccountId === sms.account_id && tx.status === 'Confirmed');
    
    scores.forEach(item => {
        const clientTxs = clientTxHistory.filter(tx => tx.clientId === item.client.id);
        if (clientTxs.length > 0) {
            item.score += 10; // High score for using the same bank account
            const lastTx = clientTxs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            item.lastUsed = new Date(lastTx.date).getTime();
        }
    });

    // Sort by score, then by most recent usage
    scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lastUsed - a.lastUsed;
    });

    const bestScore = scores[0].score;
    const topScorers = scores.filter(s => s.score === bestScore);

    if (topScorers.length === 1) {
        return topScorers[0].client;
    }

    // If still tied, no confident match can be made.
    return null;
};


// --- The main matching algorithm ---
export async function matchSmsToClients(prevState: MatchSmsState, formData: FormData): Promise<MatchSmsState> {
    try {
        const [smsSnapshot, clientsSnapshot, transactionsSnapshot, endpointsSnapshot] = await Promise.all([
            get(ref(db, 'sms_transactions')),
            get(ref(db, 'clients')),
            get(ref(db, 'transactions')),
            get(ref(db, 'sms_endpoints')),
        ]);

        if (!smsSnapshot.exists() || !clientsSnapshot.exists() || !endpointsSnapshot.exists()) {
            return { message: "No SMS, clients, or endpoints found to perform matching.", error: false };
        }

        const allSmsData: Record<string, SmsTransaction> = smsSnapshot.val();
        const allClientsData: Record<string, Client> = clientsSnapshot.val();
        const allTransactionsData: Record<string, Transaction> = transactionsSnapshot.val() || {};
        const allEndpointsData: Record<string, SmsEndpoint> = endpointsSnapshot.val();
        
        const clientsArray: ClientWithId[] = Object.values(allClientsData).map((c, i) => ({ ...c, id: Object.keys(allClientsData)[i] }));
        const transactionsArray: (Transaction & { id: string })[] = Object.values(allTransactionsData).map((t, i) => ({ ...t, id: Object.keys(allTransactionsData)[i] }));

        const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
        const smsToMatch = Object.entries(allSmsData)
            .map(([id, sms]) => ({ id, ...sms }))
            .filter(sms => sms.status === 'parsed' && new Date(sms.parsed_at).getTime() >= fortyEightHoursAgo);
        
        if (smsToMatch.length === 0) {
            return { message: "No new SMS messages to match.", error: false };
        }
        
        const updates: { [key: string]: any } = {};
        let matchedCount = 0;
        
        const rulePriority: NameMatchingRule[] = ['phone_number', 'first_and_second', 'full_name', 'part_of_full_name', 'first_and_last'];

        for (const sms of smsToMatch) {
            if (!sms.client_name || !sms.account_id) continue;
            
            const endpoint = Object.values(allEndpointsData).find(e => e.accountId === sms.account_id);
            if (!endpoint || !endpoint.nameMatchingRules || endpoint.nameMatchingRules.length === 0) continue;

            const sortedRules = rulePriority.filter(rule => endpoint.nameMatchingRules!.includes(rule));

            let potentialMatches: ClientWithId[] = [];
            
            for (const rule of sortedRules) {
                switch(rule) {
                    case 'phone_number':
                        potentialMatches = matchByPhoneNumber(clientsArray, sms.client_name);
                        break;
                    case 'first_and_second':
                        potentialMatches = matchByFirstNameAndSecondName(clientsArray, sms.client_name);
                        break;
                    case 'full_name':
                    case 'part_of_full_name':
                        potentialMatches = matchByFullNameOrPartial(clientsArray, sms.client_name);
                        break;
                    case 'first_and_last':
                        potentialMatches = matchByFirstNameAndLastName(clientsArray, sms.client_name);
                        break;
                }
                
                if (potentialMatches.length > 0) break; // Stop at the first rule that finds matches
            }
            
            if (potentialMatches.length > 0) {
                const finalMatch = scoreAndSelectBestMatch(potentialMatches, sms, transactionsArray);
                if (finalMatch) {
                    updates[`/sms_transactions/${sms.id}/status`] = 'matched';
                    updates[`/sms_transactions/${sms.id}/matched_client_id`] = finalMatch.id;
                    updates[`/sms_transactions/${sms.id}/matched_client_name`] = finalMatch.name;
                    matchedCount++;
                }
            }
        }
        
        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/sms/transactions');
        return { message: `Matching complete. Successfully matched ${matchedCount} SMS record(s).`, error: false };

     } catch(error: any) {
        console.error("SMS Matching Error:", error);
        return { message: error.message || "An unknown error occurred during matching.", error: true };
    }
}


// --- Client Merge Action ---
export type MergeState = {
    message?: string;
    error?: boolean;
    success?: boolean;
    mergedGroups?: {
        primary: Client;
        duplicates: Client[];
    }[];
} | undefined;

export async function mergeDuplicateClients(prevState: MergeState, formData: FormData): Promise<MergeState> {
    try {
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);

        if (!clientsSnapshot.exists()) {
            return { message: "No clients found to merge.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        
        const clientsByName: Record<string, Client[]> = {};

        for (const clientId in clientsData) {
            const client = { id: clientId, ...clientsData[clientId] };
            if (!client.name) continue;
            const normalizedName = client.name.trim().toLowerCase();
            
            if (!clientsByName[normalizedName]) {
                clientsByName[normalizedName] = [];
            }
            clientsByName[normalizedName].push(client);
        }

        const updates: { [key: string]: any } = {};
        const mergedGroups: { primary: Client, duplicates: Client[] }[] = [];

        for (const name in clientsByName) {
            const group = clientsByName[name];
            if (group.length > 1) {
                group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                
                const primaryClient = group[0];
                const duplicates = group.slice(1);
                
                mergedGroups.push({ primary: primaryClient, duplicates });

                const allPhones = new Set(Array.isArray(primaryClient.phone) ? primaryClient.phone : [primaryClient.phone].filter(Boolean));
                const allKycDocs = new Map(primaryClient.kyc_documents?.map(doc => [doc.url, doc]) || []);
                const allBep20 = new Set(primaryClient.bep20_addresses || []);

                for (const dup of duplicates) {
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

        revalidatePath('/clients/merge');
        revalidatePath('/clients');
        return { 
            message: `Merge complete. Processed ${mergedGroups.length} groups.`, 
            error: false,
            success: true,
            mergedGroups,
        };

    } catch (error: any) {
        console.error("Client Merge Error:", error);
        return { message: error.message || "An unknown error occurred during the merge.", error: true };
    }
}


// --- SMS Parsing Rule Actions ---
export type ParsingRuleFormState = { message?: string } | undefined;

const SmsParsingRuleSchema = z.object({
    name: z.string().min(1, { message: "Rule name is required." }),
    type: z.enum(['credit', 'debit']),
    amountStartsAfter: z.string().min(1, { message: 'This marker is required.' }),
    amountEndsBefore: z.string().min(1, { message: 'This marker is required.' }),
    personStartsAfter: z.string().min(1, { message: 'This marker is required.' }),
    personEndsBefore: z.string().optional(),
});

export async function createSmsParsingRule(formData: FormData): Promise<ParsingRuleFormState> {
    const rawData = {
        name: formData.get('name'),
        type: formData.get('type'),
        amountStartsAfter: formData.get('amountStartsAfter'),
        amountEndsBefore: formData.get('amountEndsBefore'),
        personStartsAfter: formData.get('personStartsAfter'),
        personEndsBefore: formData.get('personEndsBefore'),
    };
    const validatedFields = SmsParsingRuleSchema.safeParse(rawData);

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


export type AutoProcessState = { message?: string; error?: boolean; } | undefined;

export async function autoProcessSyncedTransactions(prevState: AutoProcessState, formData: FormData): Promise<AutoProcessState> {
    let combinedMessage = '';

    const bscSyncResult = await syncBscTransactions(undefined, new FormData());
    if (bscSyncResult?.error) {
        return bscSyncResult;
    }
    combinedMessage += bscSyncResult?.message || '';

    const smsProcessResult = await processIncomingSms(undefined, new FormData());
    if (smsProcessResult?.error) {
        return smsProcessResult;
    }
    combinedMessage += `\n${smsProcessResult?.message || ''}`;

    const smsMatchResult = await matchSmsToClients(undefined, new FormData());
    if (smsMatchResult?.error) {
        return smsMatchResult;
    }
    combinedMessage += `\n${smsMatchResult?.message || ''}`;


    try {
        const [transactionsSnapshot, smsSnapshot, settingsSnapshot] = await Promise.all([
            get(ref(db, 'transactions')),
            get(ref(db, 'sms_transactions')),
            get(ref(db, 'settings'))
        ]);

        if (!transactionsSnapshot.exists() || !settingsSnapshot.exists()) {
            combinedMessage += "\nNo transactions or settings found to process.";
            return { message: combinedMessage, error: false };
        }

        const allTransactions: Record<string, Transaction> = transactionsSnapshot.val();
        const allSms: Record<string, SmsTransaction> = smsSnapshot.val() || {};
        const settings: Settings = settingsSnapshot.val();

        const virginTxs = Object.values(allTransactions).filter(tx => 
            tx.hash && !tx.bankAccountId && tx.type === 'Deposit'
        );

        if (virginTxs.length === 0) {
            combinedMessage += "\nNo new deposits to auto-process.";
            return { message: combinedMessage, error: false };
        }

        const getRate = (currency?: string) => {
            if (!currency || !settings) return 1;
            switch(currency) {
                case 'YER': return settings.yer_usd || 0;
                case 'SAR': return settings.sar_usd || 0;
                default: return 1;
            }
        };

        const updates: { [key: string]: any } = {};
        let processedCount = 0;

        const availableSms = Object.entries(allSms)
            .map(([id, sms]) => ({ ...sms, id }))
            .filter(sms => sms.status === 'matched' && sms.type === 'credit' && sms.amount && sms.currency);
        
        for (const tx of virginTxs) {
            if (!tx.clientId || tx.clientId === 'unassigned-bscscan') continue;

            const clientSms = availableSms.filter(sms => sms.matched_client_id === tx.clientId);
            
            if (clientSms.length === 0) continue;

            let bestMatch: { sms: SmsTransaction & { id: string }, difference: number } | null = null;
            const txAmountUsd = tx.amount_usdt;

            for (const sms of clientSms) {
                const smsRate = getRate(sms.currency!);
                if (smsRate > 0) {
                    const smsAmountUsd = sms.amount! * smsRate;
                    const difference = Math.abs(txAmountUsd - smsAmountUsd);

                    if (difference < 2) {
                        if (!bestMatch || difference < bestMatch.difference) {
                            bestMatch = { sms, difference };
                        }
                    }
                }
            }
            
            if (bestMatch) {
                const matchedSms = bestMatch.sms;
                
                const smsRate = getRate(matchedSms.currency!);
                const finalAmountUsd = matchedSms.amount! * smsRate;
                const fee = finalAmountUsd - tx.amount_usdt;

                updates[`/transactions/${tx.id}/bankAccountId`] = matchedSms.account_id;
                updates[`/transactions/${tx.id}/bankAccountName`] = matchedSms.account_name;
                updates[`/transactions/${tx.id}/currency`] = matchedSms.currency;
                updates[`/transactions/${tx.id}/amount`] = matchedSms.amount;
                updates[`/transactions/${tx.id}/amount_usd`] = finalAmountUsd;
                updates[`/transactions/${tx.id}/fee_usd`] = fee > 0 ? fee : 0;
                updates[`/transactions/${tx.id}/expense_usd`] = fee < 0 ? -fee : 0;
                updates[`/transactions/${tx.id}/status`] = 'Confirmed';
                updates[`/transactions/${tx.id}/notes`] = `Auto-matched with SMS ID: ${matchedSms.id}. ${tx.notes || ''}`.trim();

                updates[`/sms_transactions/${matchedSms.id}/status`] = 'used';
                updates[`/sms_transactions/${matchedSms.id}/transaction_id`] = tx.id;
                
                const index = availableSms.findIndex(s => s.id === matchedSms.id);
                if (index > -1) availableSms.splice(index, 1);

                processedCount++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/transactions');
        combinedMessage += `\nAuto-linking complete. Updated ${processedCount} transaction(s).`;
        return { message: combinedMessage, error: false };

    } catch (error: any) {
        console.error("Auto Process Error:", error);
        return { message: error.message || "An unknown error occurred during auto-processing.", error: true };
    }
}

export async function linkAllUnassignedTransactions(prevState: AutoProcessState, formData: FormData): Promise<AutoProcessState> {
    try {
        const [clientsSnapshot, transactionsSnapshot] = await Promise.all([
            get(ref(db, 'clients')),
            get(ref(db, 'transactions')),
        ]);

        if (!clientsSnapshot.exists() || !transactionsSnapshot.exists()) {
            return { message: "No clients or transactions to process.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        const transactionsData: Record<string, Transaction> = transactionsSnapshot.val();

        // Create a map of wallet addresses to client info
        const addressToClientMap: Record<string, { id: string, name: string }> = {};
        for (const clientId in clientsData) {
            const client = clientsData[clientId];
            if (client.bep20_addresses) {
                for (const address of client.bep20_addresses) {
                    addressToClientMap[address.toLowerCase()] = { id: clientId, name: client.name };
                }
            }
        }
        
        const updates: { [key: string]: any } = {};
        let updatedCount = 0;

        for (const txId in transactionsData) {
            const tx = transactionsData[txId];
            if (tx.clientId === 'unassigned-bscscan' && tx.client_wallet_address) {
                const foundClient = addressToClientMap[tx.client_wallet_address.toLowerCase()];
                if (foundClient) {
                    updates[`/transactions/${txId}/clientId`] = foundClient.id;
                    updates[`/transactions/${txId}/clientName`] = foundClient.name || 'Name not found';
                    updatedCount++;
                }
            }
        }
        
        if (updatedCount > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/transactions');
        revalidatePath('/clients');
        return { message: `Scan complete. Linked ${updatedCount} unassigned transaction(s).`, error: false };

    } catch (error: any) {
        console.error("Link All Unassigned Error:", error);
        return { message: error.message || "An unknown error occurred during the linking process.", error: true };
    }
}


// --- Label Actions ---
export type LabelFormState = { message?: string } | undefined;

const LabelSchema = z.object({
  name: z.string().min(1, { message: "Label name is required." }),
  color: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, { message: "Must be a valid hex color code." }),
});

export async function createLabel(formData: FormData): Promise<LabelFormState> {
    const rawData = {
        name: formData.get('name'),
        color: formData.get('color-text') || formData.get('color'),
    };
    const validatedFields = LabelSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.name?.[0] || 'Invalid data.' };
    }

    try {
        const newRef = push(ref(db, 'labels'));
        await set(newRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/labels');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to save label.' };
    }
}

export async function deleteLabel(id: string): Promise<LabelFormState> {
    if (!id) return { message: 'Invalid ID.' };
    try {
        await remove(ref(db, `labels/${id}`));
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);
        if (clientsSnapshot.exists()) {
            const updates: { [key: string]: any } = {};
            clientsSnapshot.forEach(childSnapshot => {
                const client = childSnapshot.val() as Client;
                if (client.review_flags?.includes(id)) {
                    const newFlags = client.review_flags.filter(flagId => flagId !== id);
                    updates[`/clients/${childSnapshot.key}/review_flags`] = newFlags;
                }
            });
            if(Object.keys(updates).length > 0) await update(ref(db), updates);
        }

        const transactionsRef = ref(db, 'transactions');
        const transactionsSnapshot = await get(transactionsRef);
        if (transactionsSnapshot.exists()) {
            const updates: { [key: string]: any } = {};
            transactionsSnapshot.forEach(childSnapshot => {
                const tx = childSnapshot.val() as Transaction;
                if (tx.flags?.includes(id)) {
                    const newFlags = tx.flags.filter(flagId => flagId !== id);
                    updates[`/transactions/${childSnapshot.key}/flags`] = newFlags;
                }
            });
            if(Object.keys(updates).length > 0) await update(ref(db), updates);
        }

        revalidatePath('/labels');
        revalidatePath('/clients');
        revalidatePath('/transactions');
        return {};
    } catch (error) {
        console.error(error);
        return { message: 'Database error: Failed to delete label.' };
    }
}

export async function findUnassignedTransactionsByAddress(address: string): Promise<number> {
    if (!address) return 0;
    try {
        const txsRef = ref(db, 'transactions');
        const q = query(txsRef, orderByChild('client_wallet_address'), equalTo(address));
        const snapshot = await get(q);
        if (!snapshot.exists()) return 0;
        
        const transactions = snapshot.val();
        let count = 0;
        for (const txId in transactions) {
            const tx = transactions[txId];
            if (tx.clientId === 'unassigned-bscscan') {
                count++;
            }
        }
        return count;
    } catch (error) {
        console.error('Error finding unassigned transactions:', error);
        return 0;
    }
}

export async function batchUpdateClientForTransactions(clientId: string, address: string): Promise<{error?: boolean, message: string}> {
    if (!clientId || !address) {
        return { error: true, message: 'Client ID and address are required.' };
    }

    try {
        const [clientSnapshot, txsSnapshot] = await Promise.all([
            get(ref(db, `clients/${clientId}`)),
            get(query(ref(db, 'transactions'), orderByChild('client_wallet_address'), equalTo(address)))
        ]);

        if (!clientSnapshot.exists()) {
            return { error: true, message: 'Client not found.' };
        }
        if (!txsSnapshot.exists()) {
            return { message: 'No transactions found for this address.', error: false };
        }
        
        const client = clientSnapshot.val() as Client;
        const transactions = txsSnapshot.val();
        const updates: { [key: string]: any } = {};
        let updatedCount = 0;

        for (const txId in transactions) {
            const tx = transactions[txId];
            if (tx.clientId === 'unassigned-bscscan') {
                updates[`/transactions/${txId}/clientId`] = clientId;
                updates[`/transactions/${txId}/clientName`] = client.name;
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            await update(ref(db), updates);
            return { message: `Successfully assigned ${client.name} to ${updatedCount} transaction(s).`, error: false };
        } else {
            return { message: 'No unassigned transactions needed updating.', error: false };
        }

    } catch (error) {
        console.error('Error in batch update:', error);
        return { error: true, message: 'A database error occurred during the batch update.' };
    }
}


