

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, CashPayment, JournalEntry } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction } from './helpers';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

const PROFIT_ACCOUNT_ID = '4001';
const COMMISSION_ACCOUNT_ID = '4002';
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
    currency: z.enum(['YER', 'USD', 'SAR', 'USDT']),
    bankAccountId: z.string().optional().nullable(),
    cryptoWalletId: z.string().optional().nullable(),
    amount_usd: z.coerce.number(),
    fee_usd: z.coerce.number(),
    expense_usd: z.coerce.number().optional(),
    amount_usdt: z.coerce.number(),
    exchange_rate_commission: z.coerce.number().optional(),
    attachment_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    invoice_image_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    notes: z.string().optional(),
    remittance_number: z.string().optional(),
    hash: z.string().optional(),
    client_wallet_address: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
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
    
    const invoiceImageFile = formData.get('invoice_image') as File | null;
    let invoiceImageUrlString: string | undefined = undefined;

    if (invoiceImageFile && invoiceImageFile.size > 0) {
        try {
            const filePath = `transaction_invoices/${newId}.png`;
            const fileRef = storageRef(storage, filePath);
            const snapshot = await uploadBytes(fileRef, invoiceImageFile, { contentType: 'image/png' });
            invoiceImageUrlString = await getDownloadURL(snapshot.ref);
        } catch (error) {
            console.error("Invoice image upload failed:", error);
            // Don't fail the whole transaction, just log the error.
        }
    }

    const dataToValidate = {
        ...Object.fromEntries(formData.entries()),
        attachment_url: attachmentUrlString,
        invoice_image_url: invoiceImageUrlString,
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
    
    if (transactionId) {
        const transactionRef = ref(db, `transactions/${transactionId}`);
        const snapshot = await get(transactionRef);
        const existingData = snapshot.val();
        if (!dataToSave.attachment_url) {
            dataToSave.attachment_url = existingData?.attachment_url;
        }
         if (!dataToSave.invoice_image_url) {
            dataToSave.invoice_image_url = existingData?.invoice_image_url;
        }
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
            const snapshot = await get(snapshot.ref);
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
    
    let dataForFirebase = stripUndefined(finalData);

    try {
        const transactionRef = ref(db, `transactions/${newId}`);
        if (transactionId) {
            await update(transactionRef, dataForFirebase);
        } else {
            await set(transactionRef, {
                ...dataForFirebase,
                createdAt: new Date().toISOString(),
            });
        }
    } catch (error) {
        return {
            message: 'Database Error: Failed to create transaction.'
        }
    }
    
    // --- Telegram Notification Logic ---
    if (finalData.status === 'Confirmed') {
        let title = '';
        let message = '';

        if (finalData.type === 'Deposit') {
            title = '📥 Customer Receipt Voucher';
            message = `Amount of *${finalData.amount_usdt.toFixed(2)} USDT* received from customer *${finalData.clientName}* on ${format(new Date(finalData.date), 'yyyy-MM-dd')}.`;
        } else if (finalData.type === 'Withdraw') {
             title = '📤 Customer Withdrawal Voucher';
             message = `Withdrawal of *${finalData.amount_usdt.toFixed(2)} USDT* processed for customer *${finalData.clientName}* to wallet \`${finalData.client_wallet_address}\`.`;
        }
        
        if (title && message) {
            const fullNotification = `*${title}*\n\n${message}`;
            await sendTelegramNotification(fullNotification);
        }

        if (finalData.invoice_image_url) {
            const caption = `Invoice for transaction: \`${newId}\``;
            await sendTelegramPhoto(finalData.invoice_image_url, caption);
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

    const _createJournalEntry = async (
        debitAccountId: string,
        creditAccountId: string,
        amountUsd: number,
        description: string
    ) => {
        if (amountUsd <= 0) return;

        try {
            const [debitSnapshot, creditSnapshot] = await Promise.all([
                get(ref(db, `accounts/${debitAccountId}`)),
                get(ref(db, `accounts/${creditAccountId}`)),
            ]);
            
            if (!debitSnapshot.exists() || !creditSnapshot.exists()) {
                console.error("Could not create journal entry: one or more accounts not found.");
                return;
            }

            const debitAccount = { id: debitAccountId, ...debitSnapshot.val() } as Account;
            const creditAccount = { id: creditAccountId, ...creditSnapshot.val() } as Account;

            const newEntryRef = push(ref(db, 'journal_entries'));
            await set(newEntryRef, {
                date: finalData.date,
                description,
                debit_account: debitAccountId,
                credit_account: creditAccountId,
                amount_usd: amountUsd,
                createdAt: new Date().toISOString(),
            });

        } catch (e) {
            console.error("Failed to create automated journal entry:", e);
        }
    };
    
    // Fee Income Journal
    if (finalData.fee_usd && finalData.fee_usd > 0) {
        const description = `Crypto Fee: Tx ${newId}`;
        await _createJournalEntry(finalData.bankAccountId!, PROFIT_ACCOUNT_ID, finalData.fee_usd, description);
    }

    // Exchange Rate Commission Journal
    if (finalData.exchange_rate_commission && finalData.exchange_rate_commission > 0) {
        const description = `Exchange Rate Commission: Tx ${newId}`;
        await _createJournalEntry(finalData.bankAccountId!, COMMISSION_ACCOUNT_ID, finalData.exchange_rate_commission, description);
    }
    
    // Discount/Expense Journal
    if (finalData.expense_usd && finalData.expense_usd > 0) {
        const description = `Discount/Expense: Tx ${newId}`;
        await _createJournalEntry(EXPENSE_ACCOUNT_ID, finalData.bankAccountId!, finalData.expense_usd, description);
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


export type CashReceiptFormState = {
  errors?: {
    bankAccountId?: string[];
    clientId?: string[];
    amount?: string[];
  };
  message?: string;
  success?: boolean;
} | undefined;


const CashReceiptSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to credit.'),
    senderName: z.string().optional(),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});

export async function createCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = CashReceiptSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to record receipt. Please check the fields.',
        };
    }

    const { bankAccountId, clientId, amount, senderName, remittanceNumber, note } = validatedFields.data;

    try {
        const [bankAccountSnapshot, clientSnapshot, settingsSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, 'settings')),
        ]);

        if (!bankAccountSnapshot.exists() || !clientSnapshot.exists() || !settingsSnapshot.exists()) {
            return { message: 'Error: Could not find bank account, client, or settings.', success: false };
        }

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;
        const settings = settingsSnapshot.val() as Settings;

        // Note: this part needs to be updated with new fiat_rates structure
        const fiatRates: FiatRate[] = settings.fiat_rates ? Object.values(settings.fiat_rates) : [];
        const rateInfo = fiatRates.find(r => r.currency === bankAccount.currency);
        const rate = rateInfo ? rateInfo.clientSell : 1; // Assuming sell rate for receipt
        
        if (rate <= 0) {
            return { message: `Error: Exchange rate for ${bankAccount.currency} is zero or not set.`, success: false };
        }
        const amountUsd = amount / rate;
        
        // 1. Create the CashReceipt record
        const newReceiptRef = push(ref(db, 'cash_receipts'));
        const receiptData: Omit<CashReceipt, 'id'> = {
            date: new Date().toISOString(),
            bankAccountId,
            bankAccountName: bankAccount.name,
            clientId,
            clientName: client.name,
            senderName: senderName || 'N/A',
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            remittanceNumber,
            note,
            status: 'Confirmed',
            createdAt: new Date().toISOString(),
        };
        await set(newReceiptRef, receiptData);

        // 2. Create the Journal Entry
        const clientAccountRef = ref(db, 'accounts');
        const clientAccountSnapshot = await get(clientAccountRef);
        const allAccounts = clientAccountSnapshot.val();
        let clientAccountId = Object.keys(allAccounts).find(key => allAccounts[key].name === client.name && allAccounts[key].parentId === '6000');

        if (!clientAccountId) {
            // Find the highest existing client account ID to create a new one
            const clientSubAccounts = Object.keys(allAccounts)
                .filter(key => key.startsWith('6001'))
                .map(key => parseInt(key, 10))
                .sort((a,b) => b - a);
            const nextId = clientSubAccounts.length > 0 ? clientSubAccounts[0] + 1 : 6001;
            clientAccountId = String(nextId);
            
            await set(ref(db, `accounts/${clientAccountId}`), {
                name: client.name,
                type: 'Liabilities',
                isGroup: false,
                parentId: '6000',
                currency: 'USD',
            });
        }
        
        const description = `Cash receipt from ${senderName || client.name}`;
        const newJournalRef = push(ref(db, 'journal_entries'));
        await set(newJournalRef, {
            date: new Date().toISOString(),
            description,
            debit_account: bankAccountId,
            credit_account: clientAccountId,
            debit_amount: amount,
            credit_amount: amountUsd,
            amount_usd: amountUsd,
            debit_account_name: bankAccount.name,
            credit_account_name: client.name,
            createdAt: new Date().toISOString(),
        });
        
        revalidatePath('/cash-receipts');
        revalidatePath('/accounting/journal');
        revalidatePath('/accounting/chart-of-accounts');

        return { success: true, message: 'Cash receipt recorded successfully.' };

    } catch (e: any) {
        console.error("Error creating cash receipt:", e);
        return { message: 'Database Error: Could not record cash receipt.', success: false };
    }
}

export type CashPaymentFormState = CashReceiptFormState; // Can reuse the same state type

const CashPaymentSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to debit.'),
    recipientName: z.string().optional(),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});

export async function createCashPayment(paymentId: string | null, prevState: CashPaymentFormState, formData: FormData): Promise<CashPaymentFormState> {
    const isEditing = !!paymentId;

    const validatedFields = CashPaymentSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to record payment. Please check the fields.',
        };
    }

    const { bankAccountId, clientId, amount, recipientName, remittanceNumber, note } = validatedFields.data;

    try {
        const [bankAccountSnapshot, clientSnapshot, settingsSnapshot, accountsSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`)),
            get(ref(db, 'settings')),
            get(ref(db, 'accounts')),
        ]);

        if (!bankAccountSnapshot.exists() || !clientSnapshot.exists() || !settingsSnapshot.exists() || !accountsSnapshot.exists()) {
            return { message: 'Error: Could not find required data (bank account, client, settings, or chart of accounts).', success: false };
        }

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;
        const settings = settingsSnapshot.val() as Settings;
        const allAccounts = accountsSnapshot.val();

        // Find or create the client's sub-account
        let clientAccountId = Object.keys(allAccounts).find(key => allAccounts[key].name === client.name && allAccounts[key].parentId === '6000');
        if (!clientAccountId) {
            const clientSubAccounts = Object.keys(allAccounts)
                .filter(key => key.startsWith('6001'))
                .map(key => parseInt(key, 10))
                .sort((a,b) => b-a);
            const nextId = clientSubAccounts.length > 0 ? clientSubAccounts[0] + 1 : 6001;
            clientAccountId = String(nextId);
            
            await set(ref(db, `accounts/${clientAccountId}`), {
                name: client.name,
                type: 'Liabilities',
                isGroup: false,
                parentId: '6000',
                currency: 'USD',
            });
        }
        
        const fiatRates: FiatRate[] = settings.fiat_rates ? Object.values(settings.fiat_rates) : [];
        const rateInfo = fiatRates.find(r => r.currency === bankAccount.currency);
        const rate = rateInfo ? rateInfo.clientBuy : 1; // Assuming buy rate for payment

        if (rate <= 0) {
            return { message: `Error: Exchange rate for ${bankAccount.currency} is zero or not set.`, success: false };
        }
        const amountUsd = amount / rate;

        if (isEditing) {
            const paymentRef = ref(db, `cash_payments/${paymentId}`);
            const paymentUpdates = { recipientName, remittanceNumber, note };
            await update(paymentRef, paymentUpdates);
        } else {
             // 1. Create the CashPayment record
            const newPaymentRef = push(ref(db, 'cash_payments'));
            const paymentData: Omit<CashPayment, 'id'> = {
                date: new Date().toISOString(),
                bankAccountId,
                bankAccountName: bankAccount.name,
                clientId,
                clientName: client.name,
                recipientName: recipientName || 'N/A',
                amount,
                currency: bankAccount.currency!,
                amountUsd,
                remittanceNumber,
                note,
                status: 'Confirmed',
                createdAt: new Date().toISOString(),
                journalEntryId: '', // placeholder
            };
            
            // 2. Create the Journal Entry for payment
            const description = `Cash payment to ${recipientName || client.name}`;
            const newJournalRef = push(ref(db, 'journal_entries'));
            const journalEntryId = newJournalRef.key!;
            
            await set(newJournalRef, {
                date: paymentData.date,
                description,
                debit_account: clientAccountId,
                credit_account: bankAccountId,
                debit_amount: amountUsd,   // Debit client in USD
                credit_amount: amount,     // Credit bank in its native currency
                amount_usd: amountUsd,
                debit_account_name: client.name,
                credit_account_name: bankAccount.name,
                createdAt: new Date().toISOString(),
            });

            paymentData.journalEntryId = journalEntryId;
            await set(newPaymentRef, paymentData);
        }
        
        revalidatePath('/cash-payments');
        revalidatePath('/accounting/journal');
        revalidatePath('/accounting/chart-of-accounts');

        return { success: true, message: isEditing ? 'Cash payment updated successfully.' : 'Cash payment recorded successfully.' };

    } catch (e: any) {
        console.error("Error creating/updating cash payment:", e);
        return { message: 'Database Error: Could not record cash payment.', success: false };
    }
}


export async function cancelCashPayment(paymentId: string): Promise<{ success: boolean, message?: string }> {
    if (!paymentId) {
        return { success: false, message: "Payment ID is missing." };
    }
    
    try {
        const paymentRef = ref(db, `cash_payments/${paymentId}`);
        const paymentSnapshot = await get(paymentRef);
        if (!paymentSnapshot.exists()) {
            return { success: false, message: "Payment not found." };
        }
        
        const payment = paymentSnapshot.val() as CashPayment;
        if (payment.status === 'Cancelled') {
            return { success: false, message: "This payment has already been cancelled." };
        }
        
        const { journalEntryId } = payment;

        if (journalEntryId) {
            const journalEntryRef = ref(db, `journal_entries/${journalEntryId}`);
            const journalSnapshot = await get(journalEntryRef);
            if (journalSnapshot.exists()) {
                const originalEntry = journalSnapshot.val() as JournalEntry;
                const reversalDescription = `Reversal of payment ID: ${paymentId}. Original: ${originalEntry.description}`;
                
                const newJournalRef = push(ref(db, 'journal_entries'));
                await set(newJournalRef, {
                    date: new Date().toISOString(),
                    description: reversalDescription,
                    debit_account: originalEntry.credit_account,
                    credit_account: originalEntry.debit_account,
                    debit_amount: originalEntry.credit_amount,
                    credit_amount: originalEntry.debit_amount,
                    amount_usd: originalEntry.amount_usd,
                    debit_account_name: originalEntry.credit_account_name,
                    credit_account_name: originalEntry.debit_account_name,
                    createdAt: new Date().toISOString(),
                });
            }
        }
        
        await update(paymentRef, { status: 'Cancelled' });

        revalidatePath('/cash-payments');
        revalidatePath('/accounting/journal');
        
        return { success: true };

    } catch (error) {
        console.error("Error cancelling cash payment:", error);
        return { success: false, message: "Database error while cancelling payment." };
    }
}
