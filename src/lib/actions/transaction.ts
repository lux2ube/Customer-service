

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, FiatRate, UnifiedReceipt } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto } from './helpers';
import { redirect } from 'next/navigation';
import { format } from 'date-fns';

export type TransactionFormState =
  | {
      errors?: {
        date?: string[];
        clientId?: string[];
        type?: string[];
        amount_usd?: string[];
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
    clientId: z.string().min(1, 'A client must be selected for the transaction.'),
    type: z.enum(['Deposit', 'Withdraw']),
    amount_usd: z.coerce.number(),
    fee_usd: z.coerce.number().min(0, "Fee must be positive."),
    expense_usd: z.coerce.number().optional(),
    amount_usdt: z.coerce.number(),
    bankAccountId: z.string().optional().nullable(),
    cryptoWalletId: z.string().optional().nullable(),
    attachment_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    invoice_image_url: z.string().url({ message: "Invalid URL" }).optional().nullable(),
    notes: z.string().optional(),
    remittance_number: z.string().optional(),
    hash: z.string().optional(),
    client_wallet_address: z.string().optional(),
    status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
    linkedReceiptIds: z.array(z.string()).optional(),
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

    let bankAccountName = '';
    if (dataToSave.bankAccountId) {
         try {
            const bankAccountRef = ref(db, `accounts/${dataToSave.bankAccountId}`);
            const snapshot = await get(bankAccountRef);
            if (snapshot.exists()) {
                bankAccountName = (snapshot.val() as Account).name;
            }
        } catch (e) { console.error("Could not fetch bank account name for transaction"); }
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

    const finalData = {
        id: newId,
        date: dataToSave.date,
        type: dataToSave.type,
        clientId: dataToSave.clientId,
        clientName,
        bankAccountId: dataToSave.bankAccountId,
        bankAccountName,
        cryptoWalletId: dataToSave.cryptoWalletId,
        cryptoWalletName,
        amount: dataToSave.amount_usd, // Simplification for display
        currency: 'USD',
        amount_usd: dataToSave.amount_usd,
        fee_usd: dataToSave.fee_usd,
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
            await sendTelegramNotification(`*${title}*\n\n${message}`);
        }
        if (finalData.invoice_image_url) {
            await sendTelegramPhoto(finalData.invoice_image_url, `Invoice for transaction: \`${newId}\``);
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
                    await update(clientRef, { bep20_addresses: [...existingAddresses, newAddress] });
                }
            }
        } catch (e) {
            console.error(`Failed to update BEP20 address for client ${finalData.clientId}:`, e);
        }
    }
    
    if (dataToSave.linkedReceiptIds && dataToSave.linkedReceiptIds.length > 0) {
        const updates: {[key: string]: any} = {};
        for (const id of dataToSave.linkedReceiptIds) {
            updates[`/cash_receipts/${id}/status`] = 'Used';
            updates[`/sms_transactions/${id}/status`] = 'used';
        }
        await update(ref(db), updates);
    }
    
    revalidatePath('/transactions');
    revalidatePath(`/clients/${finalData.clientId}/edit`);
    revalidatePath(`/transactions/add`);
    if(transactionId) revalidatePath(`/transactions/${transactionId}/edit`);

    return { success: true, transactionId: newId, message: 'Transaction Saved' };
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
  errors?: { bankAccountId?: string[]; clientId?: string[]; amount?: string[]; clientName?: string[]; };
  message?: string;
  success?: boolean;
} | undefined;

const CashReceiptSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to credit.'),
    clientName: z.string().min(1, 'Client name is required.'),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    amountUsd: z.coerce.number().gt(0, 'USD Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
});

export async function createQuickCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = CashReceiptSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record receipt.' };
    }
    const { bankAccountId, clientId, clientName, amount, amountUsd, remittanceNumber } = validatedFields.data;
    try {
        const bankAccountSnapshot = await get(ref(db, `accounts/${bankAccountId}`));
        if (!bankAccountSnapshot.exists()) {
            return { message: 'Error: Could not find bank account.', success: false };
        }
        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;

        const newReceiptRef = push(ref(db, 'cash_receipts'));
        const newReceiptId = newReceiptRef.key!;

        const receiptData: Omit<CashReceipt, 'id'> = {
            date: new Date().toISOString(),
            bankAccountId,
            bankAccountName: bankAccount.name,
            clientId,
            clientName,
            senderName: clientName, // For quick add, sender is the client
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            remittanceNumber: remittanceNumber || undefined
        };

        await set(newReceiptRef, stripUndefined(receiptData));
        revalidatePath('/transactions');
        return { success: true, message: 'Cash receipt recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating quick cash receipt:", e);
        return { message: 'Database Error: Could not record cash receipt.', success: false };
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
        for(const id in allSms) {
            const sms = allSms[id];
            if (sms.matched_client_id === clientId && sms.status === 'matched' && sms.type === 'credit') {
                 const rateInfo = fiatRates.find(r => r.currency === sms.currency);
                 const rate = rateInfo ? rateInfo.clientBuy : 1;
                 const amountUsd = rate > 0 ? (sms.amount || 0) / rate : 0;
                funds.push({
                    id,
                    date: sms.parsed_at,
                    clientName: sms.matched_client_name || '',
                    senderName: sms.client_name,
                    bankAccountName: sms.account_name || 'N/A',
                    amount: sms.amount || 0,
                    currency: sms.currency || '',
                    amountUsd,
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
