

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, CashPayment, JournalEntry, FiatRate, UnifiedReceipt } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction } from './helpers';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

const PROFIT_ACCOUNT_ID = '4001';
const COMMISSION_ACCOUNT_ID = '4002';
const EXPENSE_ACCOUNT_ID = '5001';
const UNMATCHED_FUNDS_ACCOUNT_ID = '7000';
const CLIENT_PARENT_ACCOUNT_ID = '6000';


export type TransactionFormState =
  | {
      errors?: {
        date?: string[];
        clientId?: string[];
        type?: string[];
        amount?: string[];
        currency?: string[];
        attachment_url?: string[];
        linkedReceiptIds?: string[];
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
    amount: z.coerce.number(),
    amount_usd: z.coerce.number(),
    fee_usd: z.coerce.number().min(0, "Fee must be positive."),
    expense_usd: z.coerce.number().optional(),
    amount_usdt: z.coerce.number(),
    cryptoWalletId: z.string().optional().nullable(),
    exchange_rate_commission: z.coerce.number().min(0, "Commission must be positive.").optional(),
    attachment_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    invoice_image_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    notes: z.string().optional(),
    remittance_number: z.string().optional(),
    hash: z.string().optional(),
    client_wallet_address: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
    linkedReceiptIds: z.array(z.string()).optional(),
}).refine(data => {
    if (data.hash && data.status === 'Confirmed') {
        return (data.linkedReceiptIds?.length || 0) > 0;
    }
    return true;
}, {
    message: "You must select at least one cash receipt to complete a synced transaction.",
    path: ["linkedReceiptIds"],
});


export async function createTransaction(transactionId: string | null, formData: FormData): Promise<TransactionFormState> {
    const newId = transactionId || push(ref(db, 'transactions')).key;
    if (!newId) throw new Error("Could not generate a transaction ID.");

    // Fetch previous state if editing
    let previousTxState: Transaction | null = null;
    if (transactionId) {
        const txSnapshot = await get(ref(db, `transactions/${transactionId}`));
        if (txSnapshot.exists()) {
            previousTxState = txSnapshot.val();
        }
    }

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
        }
    }

    const dataToValidate = {
        ...Object.fromEntries(formData.entries()),
        linkedReceiptIds: formData.getAll('linkedReceiptIds'),
        attachment_url: attachmentUrlString,
        invoice_image_url: invoiceImageUrlString,
    };
    
    const validatedFields = TransactionSchema.safeParse(dataToValidate);
    
    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to create transaction. Please check the fields.',
        };
    }
    
    let dataToSave = { ...validatedFields.data };
    let finalClientId = dataToSave.clientId;

    if (!finalClientId) {
        return {
            errors: { clientId: ["A client must be selected."] },
            message: 'Failed to create transaction. Client is required.',
        };
    }
    dataToSave.clientId = finalClientId;
    
    if (transactionId) {
        const existingData = previousTxState;
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
    
    const linkedSmsIdString = dataToSave.linkedReceiptIds?.join(',');

    const finalData: Omit<Transaction, 'currency' | 'bankAccountId'> = {
        id: newId,
        date: dataToSave.date,
        type: dataToSave.type,
        clientId: dataToSave.clientId,
        clientName,
        cryptoWalletId: dataToSave.cryptoWalletId,
        cryptoWalletName,
        amount: dataToSave.amount_usd, // `amount` now stores total USD value
        amount_usd: dataToSave.amount_usd,
        fee_usd: Math.abs(dataToSave.fee_usd),
        expense_usd: dataToSave.expense_usd,
        amount_usdt: dataToSave.amount_usdt,
        attachment_url: dataToSave.attachment_url,
        invoice_image_url: dataToSave.invoice_image_url,
        notes: dataToSave.notes,
        remittance_number: dataToSave.remittance_number,
        hash: dataToSave.hash,
        client_wallet_address: dataToSave.client_wallet_address,
        status: dataToSave.status,
        createdAt: previousTxState?.createdAt || new Date().toISOString(),
        linkedSmsId: linkedSmsIdString,
        exchange_rate_commission: Math.abs(dataToSave.exchange_rate_commission || 0),
    };
    
    let dataForFirebase = stripUndefined(finalData);

    try {
        const transactionRef = ref(db, `transactions/${newId}`);
        if (transactionId) {
            await update(transactionRef, dataForFirebase);
        } else {
            await set(transactionRef, dataForFirebase);
        }
    } catch (error) {
        return {
            message: 'Database Error: Failed to create transaction.'
        }
    }
    
    if (finalData.status === 'Confirmed' && previousTxState?.status !== 'Confirmed') {
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
            // Fire and forget
            sendTelegramPhoto(finalData.invoice_image_url, caption);
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
    
    // Mark all linked receipts/sms as used
    if (dataToSave.linkedReceiptIds && dataToSave.linkedReceiptIds.length > 0) {
        const updates: {[key: string]: any} = {};
        for (const id of dataToSave.linkedReceiptIds) {
            // ID can belong to either cash_receipts or sms_transactions
            updates[`/cash_receipts/${id}/status`] = 'Used';
            updates[`/sms_transactions/${id}/status`] = 'used';
        }
        try {
            await update(ref(db), updates);
        } catch(e) {
            console.error(`Failed to update linked receipt statuses:`, e);
        }
    }

    if (finalData.status === 'Confirmed' && previousTxState?.status !== 'Confirmed') {
      // No journal entries needed here as they are created with the cash receipts/payments
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
    clientName?: string[];
  };
  message?: string;
  success?: boolean;
} | undefined;


const CashReceiptSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to credit.'),
    clientName: z.string().min(1, 'Client name is required.'),
    senderName: z.string().optional(),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});

export async function createQuickCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    return createCashReceipt(prevState, formData);
}

export async function createCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
     const rawData = {
        ...Object.fromEntries(formData.entries()),
    };
    
    if (!rawData.clientName && rawData.clientId) {
        try {
            const clientSnapshot = await get(ref(db, `clients/${rawData.clientId}`));
            if (clientSnapshot.exists()) {
                rawData.clientName = (clientSnapshot.val() as Client).name;
            }
        } catch (e) { /* Let validation handle it if name isn't found */ }
    }
    
    const validatedFields = CashReceiptSchema.safeParse(rawData);

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to record receipt. Please check the fields.',
        };
    }

    const { bankAccountId, clientId, clientName, amount, senderName, remittanceNumber, note } = validatedFields.data;

    try {
        const [bankAccountSnapshot, allAccountsSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, 'accounts'))
        ]);

        if (!bankAccountSnapshot.exists()) {
            return { message: 'Error: Could not find bank account.', success: false };
        }
        
        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        
        const fiatHistoryRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
        const fiatHistorySnapshot = await get(fiatHistoryRef);
        let rate = 1;

        if (bankAccount.currency && bankAccount.currency !== 'USD') {
            if (fiatHistorySnapshot.exists()) {
                const lastEntryKey = Object.keys(fiatHistorySnapshot.val())[0];
                const lastEntry = fiatHistorySnapshot.val()[lastEntryKey];
                const fiatRates: FiatRate[] = lastEntry.rates || [];
                const rateInfo = fiatRates.find(r => r.currency === bankAccount.currency);
                if (rateInfo) {
                    rate = rateInfo.clientBuy;
                } else {
                     return { message: `Error: Exchange rate for ${bankAccount.currency} not found.`, success: false };
                }
            } else {
                return { message: `Error: Exchange rates are not set up.`, success: false };
            }
        }
        
        if (rate <= 0) {
            return { message: `Error: Exchange rate for ${bankAccount.currency} is zero or invalid.`, success: false };
        }
        
        const amountUsd = amount / rate;
        
        const newReceiptRef = push(ref(db, 'cash_receipts'));
        const receiptData: Omit<CashReceipt, 'id'> = {
            date: new Date().toISOString(),
            bankAccountId,
            bankAccountName: bankAccount.name,
            clientId,
            clientName: clientName,
            senderName: senderName || clientName,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            remittanceNumber,
            note,
            status: 'Pending',
            createdAt: new Date().toISOString(),
        };
        
        await set(newReceiptRef, receiptData);

        // --- Create Journal Entry for the receipt ---
        const allAccounts = allAccountsSnapshot.val() || {};

        const clientSubAccountName = `${CLIENT_PARENT_ACCOUNT_ID} - ${clientName}`;
        let clientSubAccountId = Object.keys(allAccounts).find(key => allAccounts[key].name === clientSubAccountName && allAccounts[key].parentId === CLIENT_PARENT_ACCOUNT_ID);

        if (!clientSubAccountId) {
            const newClientAccountRef = push(ref(db, 'accounts'));
            clientSubAccountId = newClientAccountRef.key!;
            const newAccountData: Partial<Account> = {
                id: clientSubAccountId,
                name: clientSubAccountName,
                type: 'Liabilities',
                isGroup: false,
                parentId: CLIENT_PARENT_ACCOUNT_ID,
                currency: 'USD',
            };
            await set(newClientAccountRef, newAccountData);
        }

        const journalEntryRef = push(ref(db, 'journal_entries'));
        const journalEntryData: Omit<JournalEntry, 'id'> = {
            date: receiptData.date,
            description: `Cash receipt from ${clientName}`,
            debit_account: bankAccountId,
            credit_account: clientSubAccountId,
            debit_amount: amount,
            credit_amount: amountUsd, // Always credit USD equivalent to liability
            amount_usd: amountUsd,
            createdAt: new Date().toISOString(),
            debit_account_name: bankAccount.name,
            credit_account_name: clientSubAccountName,
        };
        await set(journalEntryRef, journalEntryData);
        
        revalidatePath('/cash-receipts');
        revalidatePath(`/transactions/add`);
        return { success: true, message: 'Cash receipt recorded successfully.' };

    } catch (e: any) {
        console.error("Error creating cash receipt:", e);
        return { message: 'Database Error: Could not record cash receipt.', success: false };
    }
}

export type CashPaymentFormState = CashReceiptFormState; 

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
        const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`)),
        ]);

        if (!bankAccountSnapshot.exists() || !clientSnapshot.exists()) {
            return { message: 'Error: Could not find required data (bank account, client).', success: false };
        }

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;

        if (isEditing) {
            const paymentRef = ref(db, `cash_payments/${paymentId}`);
            const paymentUpdates = { recipientName, remittanceNumber, note };
            await update(paymentRef, paymentUpdates);
        } else {
            const newPaymentRef = push(ref(db, 'cash_payments'));
            const paymentData: Omit<CashPayment, 'id'> = {
                date: new Date().toISOString(),
                bankAccountId,
                bankAccountName: bankAccount.name,
                clientId,
                clientName: client.name,
                recipientName: recipientName || client.name,
                amount,
                currency: bankAccount.currency!,
                amountUsd: 0, 
                remittanceNumber,
                note,
                status: 'Confirmed',
                createdAt: new Date().toISOString(),
                journalEntryId: '', 
            };
            
            await set(newPaymentRef, paymentData);
        }
        
        revalidatePath('/cash-payments');

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
        
        await update(paymentRef, { status: 'Cancelled' });

        revalidatePath('/cash-payments');
        
        return { success: true };

    } catch (error) {
        console.error("Error cancelling cash payment:", error);
        return { success: false, message: "Database error while cancelling payment." };
    }
}

export async function getAvailableClientFunds(clientId: string): Promise<UnifiedReceipt[]> {
    if (!clientId) return [];
    
    try {
        const [cashReceiptsSnapshot, smsTransactionsSnapshot] = await Promise.all([
            get(ref(db, 'cash_receipts')),
            get(ref(db, 'sms_transactions')),
        ]);
        
        const allCashReceipts: Record<string, CashReceipt> = cashReceiptsSnapshot.val() || {};
        const allSms: Record<string, SmsTransaction> = smsTransactionsSnapshot.val() || {};
        
        const fiatHistoryRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
        const fiatHistorySnapshot = await get(fiatHistoryRef);
        let fiatRates: FiatRate[] = [];
        if (fiatHistorySnapshot.exists()) {
            const lastEntryKey = Object.keys(fiatHistorySnapshot.val())[0];
            fiatRates = fiatHistorySnapshot.val()[lastEntryKey].rates || [];
        }

        const funds: UnifiedReceipt[] = [];

        // Process Manual Cash Receipts
        for(const id in allCashReceipts) {
            const receipt = allCashReceipts[id];
            if (receipt.clientId === clientId && receipt.status === 'Pending') {
                funds.push({
                    id,
                    date: receipt.date,
                    clientName: receipt.clientName,
                    senderName: receipt.senderName,
                    bankAccountName: receipt.bankAccountName,
                    amount: receipt.amount,
                    currency: receipt.currency,
                    amountUsd: receipt.amountUsd,
                    remittanceNumber: receipt.remittanceNumber,
                    source: 'Manual',
                    status: receipt.status
                });
            }
        }
        
        // Process Matched SMS Transactions
        for(const id in allSms) {
            const sms = allSms[id];
            if (sms.matched_client_id === clientId && sms.status === 'matched' && sms.type === 'credit') {
                 const rateInfo = fiatRates.find(r => r.currency === sms.currency);
                 const rate = rateInfo ? rateInfo.clientSell : 1;
                 const amountUsd = rate > 0 ? (sms.amount || 0) / rate : 0;
                
                funds.push({
                    id,
                    date: sms.parsed_at,
                    clientName: sms.matched_client_name || '',
                    senderName: sms.client_name,
                    bankAccountName: sms.account_name || 'N/A',
                    amount: sms.amount || 0,
                    currency: sms.currency || '',
                    amountUsd: amountUsd,
                    remittanceNumber: sms.id.slice(-6),
                    source: 'SMS',
                    status: sms.status
                });
            }
        }

        return funds.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    } catch (error) {
        console.error("Error fetching available client funds:", error);
        return [];
    }
}
