
'use server';

import { z } from 'zod';
import { db, storage } from './firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, KycDocument } from './types';
import { 
    initializeWhatsAppClient as initWhatsApp, 
    getWhatsAppClientStatus as getWhatsAppStatus, 
    sendWhatsAppMessage 
} from './whatsapp';

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
                credit_account: ['Debit and credit accounts cannot be the same.'],
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
    }
  | undefined;

const ClientSchema = z.object({
    name: z.string().min(1, { message: 'Name is required.' }),
    phone: z.string().min(1, { message: 'Phone is required.' }),
    verification_status: z.enum(['Active', 'Inactive', 'Pending']),
    review_flags: z.array(z.string()).optional(),
});

export async function createClient(clientId: string | null, prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
    console.log("Attempting to save client data...");
    const newId = clientId || push(ref(db, 'clients')).key;
    if (!newId) {
        const errorMsg = "Could not generate a client ID.";
        console.error(errorMsg);
        throw new Error(errorMsg);
    }
    
    // Handle file uploads
    const kycFiles = formData.getAll('kyc_files') as File[];
    const uploadedDocuments: KycDocument[] = [];

    if (kycFiles && kycFiles.length > 0) {
        console.log(`Found ${kycFiles.length} file(s) to upload.`);
        for (const file of kycFiles) {
            if (file.size === 0) {
                console.log(`Skipping empty file input: ${file.name}`);
                continue;
            }
            try {
                const filePath = `kyc_documents/${newId}/${file.name}`;
                console.log(`Uploading file: ${file.name} to path: ${filePath}`);
                const fileRef = storageRef(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                console.log(`Successfully uploaded file: ${file.name}`);
                const downloadURL = await getDownloadURL(snapshot.ref);
                 console.log(`Got download URL: ${downloadURL}`);
                uploadedDocuments.push({
                    name: file.name,
                    url: downloadURL,
                    uploadedAt: new Date().toISOString(),
                });
            } catch (error) {
                console.error("-----------------------------------");
                console.error("Firebase Storage upload FAILED for file:", file.name);
                console.error("Full error object:", error);
                console.error("-----------------------------------");
                
                const errorMessage = (error as any)?.code;
                let userMessage = `File upload failed. Please check server logs.`;

                if (errorMessage === 'storage/unauthorized') {
                    userMessage = 'Upload failed due to permissions. Please update your Firebase Storage Rules to allow writes.';
                } else if (errorMessage) {
                    userMessage = `Upload failed with error: ${errorMessage}. Please check server logs.`;
                }
                
                return { message: userMessage };
            }
        }
    }

    const dataToValidate = {
        name: formData.get('name'),
        phone: formData.get('phone'),
        verification_status: formData.get('verification_status'),
        review_flags: formData.getAll('review_flags'),
    };

    const validatedFields = ClientSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        console.error("Client data validation failed:", validatedFields.error.flatten().fieldErrors);
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save client. Please check the fields.',
        };
    }
    
    const finalData: Partial<Omit<Client, 'id' | 'kyc_documents'>> = validatedFields.data;
    const dataForFirebase = stripUndefined(finalData);

    try {
        const clientDbRef = ref(db, `clients/${clientId || newId}`);
        const snapshot = await get(clientDbRef);
        const existingData = snapshot.val() as Client | null;
        const existingDocs = existingData?.kyc_documents || [];
        
        dataForFirebase.kyc_documents = [...existingDocs, ...uploadedDocuments];

        if (clientId) {
            console.log(`Updating client ${clientId} in database...`);
            await update(clientDbRef, dataForFirebase);
            console.log("Client updated successfully.");
        } else {
            console.log(`Creating new client ${newId} in database...`);
            await set(clientDbRef, {
                ...dataForFirebase,
                createdAt: new Date().toISOString()
            });
            console.log("New client created successfully.");
        }
    } catch (error) {
        console.error("-----------------------------------");
        console.error("Realtime Database save FAILED for client:", newId);
        console.error("Full error object:", error);
        console.error("-----------------------------------");
        return { message: 'Database Error: Failed to save client data. Check server logs.' }
    }
    
    // Revalidate the edit page to show new files immediately if editing
    if (clientId) {
        revalidatePath(`/clients/${clientId}/edit`);
    }
    revalidatePath('/clients');
    redirect('/clients');
}

export async function manageClient(clientId: string, prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
    const intent = formData.get('intent') as string | null;
    console.log(`Managing client ${clientId} with intent: ${intent || 'update/create'}`);

    if (intent?.startsWith('delete:')) {
        const documentName = intent.split(':')[1];
        if (!documentName) {
            const errorMsg = 'Document name not provided for deletion.';
            console.error(errorMsg);
            return { message: errorMsg };
        }
        try {
            const filePath = `kyc_documents/${clientId}/${documentName}`;
            console.log(`Attempting to delete document from storage: ${filePath}`);
            const fileRef = storageRef(storage, filePath);
            await deleteObject(fileRef);
            console.log("Document successfully deleted from storage.");

            console.log(`Attempting to remove document record from database for client ${clientId}`);
            const clientRef = ref(db, `clients/${clientId}`);
            const snapshot = await get(clientRef);
            if (snapshot.exists()) {
                const clientData = snapshot.val() as Client;
                const updatedDocs = clientData.kyc_documents?.filter(doc => doc.name !== documentName) || [];
                await update(clientRef, { kyc_documents: updatedDocs });
                console.log("Document record removed from database.");
            } else {
                console.warn(`Client ${clientId} not found in database for document record deletion.`);
            }

            revalidatePath(`/clients/${clientId}/edit`);
            return { success: true, message: "Document deleted successfully." };
        } catch (error) {
            console.error("-----------------------------------");
            console.error("Firebase Storage document deletion FAILED for:", documentName);
            console.error("Full error object:", error);
            console.error("-----------------------------------");
            
            const errorMessage = (error as any)?.code;
            let userMessage = `Failed to delete document. Please check server logs.`;

            if (errorMessage === 'storage/unauthorized') {
                userMessage = 'Deletion failed due to permissions. Please update your Firebase Storage Rules to allow deletes.';
            } else if (errorMessage) {
                userMessage = `Deletion failed with error: ${errorMessage}. Please check server logs.`;
            }

            return { message: userMessage };
        }
    }

    // Default action is to update/create the client
    return createClient(clientId, prevState, formData);
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
    clientId: z.string().min(1, { message: 'Please select a client.' }),
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
            console.error("File upload failed: ", error);
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
        console.log(validatedFields.error.flatten().fieldErrors);
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    let dataToSave = { ...validatedFields.data };
    
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
            const client = snapshot.val() as Client;
            clientName = client.name;
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
        console.log(error);
        return {
            message: 'Database Error: Failed to create transaction.'
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
                console.error(`Could not find accounts or settings for journal entry: ${debitAccountId}, ${creditAccountId}`);
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
                 console.error(`Exchange rate is zero for journal entry accounts.`);
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
                credit_amount: creditAmount,
                debit_currency: debitAccount.currency || 'USD',
                credit_currency: creditAccount.currency || 'USD',
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
    redirect('/transactions');
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
            const newAccountRef = ref(db, `accounts/${id}`)
            await set(newAccountRef, dataForFirebase);
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

        let newTxCount = 0;
        const updates: { [key: string]: any } = {};

        // Fetch the name of wallet '1003' for better display
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

            // If 'to' is our wallet, it's an incoming tx -> client is sending us crypto to get fiat -> 'Withdrawal'
            // If 'from' is our wallet, it's an outgoing tx -> client sent us fiat to get crypto -> 'Deposit'
            const transactionType = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase() ? 'Withdraw' : 'Deposit';

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = transactionType === 'Withdraw' 
                ? `Synced from BscScan. From: ${tx.from}` 
                : `Synced from BscScan. To: ${tx.to}`;

            // For synced transactions, the amount from the API is the final USDT amount.
            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: 'unassigned-bscscan',
                clientName: 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
                cryptoWalletName: cryptoWalletName,
                amount: syncedAmount,
                currency: 'USDT',
                amount_usd: syncedAmount, // The USD value is the same as the USDT value
                fee_usd: 0,
                expense_usd: 0,
                amount_usdt: syncedAmount, // This is the final value that affects the wallet balance
                hash: tx.hash,
                status: 'Confirmed',
                notes: note,
                client_wallet_address: transactionType === 'Withdraw' ? tx.from : tx.to,
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
                phone: phoneNumber,
                verification_status: 'Active', // Default status for imported clients
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

// --- WhatsApp Actions ---

export async function initializeWhatsAppClient() {
    await initWhatsApp();
}

export async function getWhatsAppClientStatus() {
    const status = await getWhatsAppStatus();
    // Return a plain object, not a class instance
    return { status: status.status, qrCodeDataUrl: status.qrCodeDataUrl };
}

export type WhatsAppSendState = { message?: string; success?: boolean; } | undefined;

export async function sendWhatsAppNotification(transactionId: string): Promise<WhatsAppSendState> {
    if (!transactionId) {
        return { message: 'Transaction ID is missing.', success: false };
    }

    try {
        // 1. Get Transaction Details
        const txRef = ref(db, `transactions/${transactionId}`);
        const txSnapshot = await get(txRef);
        if (!txSnapshot.exists()) {
            return { message: `Transaction with ID ${transactionId} not found.`, success: false };
        }
        const transaction: Transaction = { id: transactionId, ...txSnapshot.val() };

        // 2. Get Client Phone Number
        const clientRef = ref(db, `clients/${transaction.clientId}`);
        const clientSnapshot = await get(clientRef);
        if (!clientSnapshot.exists()) {
            return { message: `Client with ID ${transaction.clientId} not found.`, success: false };
        }
        const client: Client = clientSnapshot.val();
        const phoneNumber = client.phone;

        if (!phoneNumber) {
            return { message: `Client ${client.name} does not have a phone number.`, success: false };
        }

        // 3. Construct Message
        const formattedAmount = new Intl.NumberFormat('en-US').format(transaction.amount);
        const formattedUsdAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(transaction.amount_usd);

        let message = `*Transaction Notification*\n\n` +
                      `Hello ${client.name},\n\n` +
                      `Here's a confirmation of your recent transaction:\n\n` +
                      `*ID:* ${transaction.id}\n` +
                      `*Type:* ${transaction.type}\n` +
                      `*Amount:* ${formattedAmount} ${transaction.currency} (${formattedUsdAmount})\n` +
                      `*Status:* ${transaction.status}\n\n` +
                      `Thank you for your business.`;

        // 4. Send Message via WhatsApp
        await sendWhatsAppMessage(phoneNumber, message);

        revalidatePath(`/transactions/${transactionId}/edit`);
        return { message: 'WhatsApp notification sent successfully!', success: true };

    } catch (error: any) {
        console.error("Failed to send WhatsApp notification:", error);
        return { message: error.message || "An unknown error occurred.", success: false };
    }
}
