
'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem } from '../types';
import { stripUndefined } from './helpers';
import { redirect } from 'next/navigation';

const PROFIT_ACCOUNT_ID = '4001';
const EXPENSE_ACCOUNT_ID = '5001';

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

    if (finalData.clientId && finalData.client_wallet_address) {
        try {
            const clientRef = ref(db, `clients/${finalData.clientId}`);
            const clientSnapshot = await get(clientRef);
            if (clientSnapshot.exists()) {
                const clientData = clientSnapshot.val() as Client;
                const existingAddresses = clientData.bep20_addresses || [];
                const newAddress = finalData.client_wallet_address;

                if (!existingAddresses.some(addr => addr.toLowerCase() === newAddress.toLowerCase())) {
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
    
    redirect(`/transactions/${newId}/edit`);
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
