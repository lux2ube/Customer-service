

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, FiatRate, UnifiedReceipt, CashPayment, UsdtManualReceipt, UnifiedFinancialRecord, UsdtPayment, SendRequest } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction, getNextSequentialId } from './helpers';
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
    type: z.enum(['Deposit', 'Withdraw', 'Modern', 'Transfer']),
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

export async function createCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
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
            senderName: clientName, // For manual add, sender is the client
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            remittanceNumber: remittanceNumber || undefined
        };

        await set(newReceiptRef, stripUndefined(receiptData));

        // Create journal entry
        const journalDesc = `Cash receipt from ${clientName} for ${amount} ${bankAccount.currency}`;
        const newJournalRef = push(ref(db, 'journal_entries'));
        await set(newJournalRef, {
            date: receiptData.date,
            description: journalDesc,
            debit_account: bankAccountId,
            credit_account: `6001${clientId}`, // Assuming client liability account
            debit_amount: amount,
            credit_amount: amountUsd,
            amount_usd: amountUsd,
            createdAt: new Date().toISOString(),
            debit_account_name: bankAccount.name,
            credit_account_name: clientName,
        });

        revalidatePath('/cash-receipts');
        return { success: true, message: 'Cash receipt recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating cash receipt:", e);
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


export async function getUnifiedClientRecords(clientId: string): Promise<UnifiedFinancialRecord[]> {
    if (!clientId) return [];
    try {
        const [cashReceiptsSnap, cashPaymentsSnap, usdtReceiptsSnap, usdtPaymentsSnap, smsSnap, fiatHistorySnap, sendRequestsSnap] = await Promise.all([
            get(ref(db, 'cash_receipts')),
            get(ref(db, 'cash_payments')),
            get(ref(db, 'usdt_receipts')),
            get(ref(db, 'usdt_payments')),
            get(ref(db, 'sms_transactions')),
            get(query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1))),
            get(ref(db, 'send_requests')),
        ]);

        const allCashReceipts: Record<string, CashReceipt> = cashReceiptsSnap.val() || {};
        const allCashPayments: Record<string, CashPayment> = cashPaymentsSnap.val() || {};
        const allUsdtReceipts: Record<string, UsdtManualReceipt> = usdtReceiptsSnap.val() || {};
        const allUsdtPayments: Record<string, UsdtPayment> = usdtPaymentsSnap.val() || {};
        const allSms: Record<string, SmsTransaction> = smsSnap.val() || {};
        const allSendRequests: Record<string, SendRequest> = sendRequestsSnap.val() || {};
        
        let fiatRates: FiatRate[] = [];
        if (fiatHistorySnap.exists()) {
            const lastEntryKey = Object.keys(fiatHistorySnap.val())[0];
            fiatRates = fiatHistorySnap.val()[lastEntryKey].rates || [];
        }

        const records: UnifiedFinancialRecord[] = [];

        // Cash Receipts (Inflow, Fiat)
        for (const id in allCashReceipts) {
            const r = allCashReceipts[id];
            if (r.clientId === clientId && r.status === 'Pending') {
                records.push({ id, date: r.date, type: 'inflow', category: 'fiat', source: 'Manual', amount: r.amount, currency: r.currency, amountUsd: r.amountUsd, status: r.status, bankAccountName: r.bankAccountName });
            }
        }
        
        // Cash Payments (Outflow, Fiat)
        for (const id in allCashPayments) {
            const p = allCashPayments[id];
            if (p.clientId === clientId && p.status === 'Confirmed') { // Assume we can use confirmed payments
                 records.push({ id, date: p.date, type: 'outflow', category: 'fiat', source: 'Cash Payment', amount: p.amount, currency: p.currency, amountUsd: p.amountUsd, status: p.status, bankAccountName: p.bankAccountName });
            }
        }
        
        // USDT Receipts (Inflow, Crypto)
        for (const id in allUsdtReceipts) {
            const r = allUsdtReceipts[id];
            if (r.clientId === clientId && r.status === 'Completed') {
                records.push({ id, date: r.date, type: 'inflow', category: 'crypto', source: 'USDT', amount: r.amount, currency: 'USDT', amountUsd: r.amount, status: r.status, cryptoWalletName: r.cryptoWalletName });
            }
        }
        
        // USDT Payments (Outflow, Crypto) - Manual
        for (const id in allUsdtPayments) {
            const p = allUsdtPayments[id];
            if (p.clientId === clientId && p.status === 'Completed') {
                records.push({ id, date: p.date, type: 'outflow', category: 'crypto', source: 'USDT Payment', amount: p.amount, currency: 'USDT', amountUsd: p.amount, status: p.status });
            }
        }
        
        // Send Requests from Wallet (Outflow, Crypto)
        for (const id in allSendRequests) {
            const req = allSendRequests[id];
            // Need to link client to send request. This is a gap. For now, we assume if we found the client by address it's for them.
            // A more robust system might store clientId on the send_request.
            const p = (await get(ref(db, `clients`))).val()
            const client = Object.values(p as any).find((c: any) => c.bep20_addresses?.includes(req.to)) as Client | undefined;
            if(client?.id === clientId && req.status === 'sent'){
                 records.push({ id, date: new Date(req.timestamp).toISOString(), type: 'outflow', category: 'crypto', source: 'Wallet', amount: req.amount, currency: 'USDT', amountUsd: req.amount, status: req.status });
            }
        }

        // SMS Transactions (Inflow/Outflow, Fiat)
        for (const id in allSms) {
            const sms = allSms[id];
            if (sms.matched_client_id === clientId && sms.status === 'matched') {
                const rateInfo = fiatRates.find(r => r.currency === sms.currency);
                const rate = sms.type === 'credit' ? (rateInfo?.clientBuy || 1) : (rateInfo?.clientSell || 1);
                const amountUsd = rate > 0 ? (sms.amount || 0) / rate : 0;
                records.push({ id, date: sms.parsed_at, type: sms.type === 'credit' ? 'inflow' : 'outflow', category: 'fiat', source: 'SMS', amount: sms.amount || 0, currency: sms.currency || '', amountUsd, status: sms.status, bankAccountName: sms.account_name });
            }
        }

        return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
        console.error("Error fetching unified client records:", error);
        return [];
    }
}


export type CashPaymentFormState = {
  errors?: { bankAccountId?: string[]; clientId?: string[]; amount?: string[]; recipientName?: string[]; };
  message?: string;
  success?: boolean;
} | undefined;

const CashPaymentSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to debit from.'),
    recipientName: z.string().optional(),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    amountUsd: z.coerce.number().gt(0, 'USD Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});


export async function createCashPayment(paymentId: string | null, prevState: CashPaymentFormState, formData: FormData): Promise<CashPaymentFormState> {
    const validatedFields = CashPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.' };
    }

    const { bankAccountId, clientId, recipientName, amount, amountUsd, remittanceNumber, note } = validatedFields.data;
    
    try {
        const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`)),
        ]);
        
        if (!bankAccountSnapshot.exists()) return { message: 'Bank account not found.', success: false };
        if (!clientSnapshot.exists()) return { message: 'Client not found.', success: false };

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;

        const newPaymentRef = paymentId ? ref(db, `cash_payments/${paymentId}`) : push(ref(db, 'cash_payments'));
        const newPaymentId = paymentId || newPaymentRef.key!;

        const journalDesc = `Cash payment to ${recipientName || client.name} for ${amount} ${bankAccount.currency}`;
        const newJournalRef = push(ref(db, 'journal_entries'));
        
        const paymentData = {
            id: newPaymentId,
            date: new Date().toISOString(),
            bankAccountId,
            bankAccountName: bankAccount.name,
            clientId,
            clientName: client.name,
            recipientName: recipientName || client.name,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            remittanceNumber: remittanceNumber || undefined,
            note: note || undefined,
            status: 'Confirmed' as const,
            createdAt: new Date().toISOString(),
            journalEntryId: newJournalRef.key,
        };

        const updates: { [key: string]: any } = {};
        updates[`/cash_payments/${newPaymentId}`] = stripUndefined(paymentData);
        updates[`/journal_entries/${newJournalRef.key}`] = {
            date: paymentData.date,
            description: journalDesc,
            debit_account: `6001${clientId}`, // Assuming client liability account
            credit_account: bankAccountId,
            debit_amount: amountUsd,
            credit_amount: amount,
            amount_usd: amountUsd,
            createdAt: new Date().toISOString(),
            debit_account_name: client.name,
            credit_account_name: bankAccount.name,
        };
        
        await update(ref(db), updates);

        revalidatePath('/cash-payments');
        return { success: true, message: 'Cash payment recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating cash payment:", e);
        return { message: 'Database Error: Could not record cash payment.', success: false };
    }
}

export async function createQuickCashPayment(prevState: CashPaymentFormState, formData: FormData): Promise<CashPaymentFormState> {
    const validatedFields = CashPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.' };
    }
    const { bankAccountId, clientId, amount, amountUsd, remittanceNumber } = validatedFields.data;

    try {
        const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`)),
        ]);
        if (!bankAccountSnapshot.exists()) return { message: 'Error: Could not find bank account.', success: false };
        if (!clientSnapshot.exists()) return { message: 'Error: Could not find client.', success: false };

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;

        const newPaymentRef = push(ref(db, 'cash_payments'));
        const paymentData: Omit<CashPayment, 'id'> = {
            date: new Date().toISOString(),
            bankAccountId,
            bankAccountName: bankAccount.name,
            clientId,
            clientName: client.name,
            recipientName: client.name, // For quick add, recipient is the client
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            status: 'Confirmed', // Quick payments are auto-confirmed
            createdAt: new Date().toISOString(),
            remittanceNumber: remittanceNumber || undefined
        };

        await set(newPaymentRef, stripUndefined(paymentData));
        revalidatePath('/transactions'); // To refresh the modern transaction form
        return { success: true, message: 'Cash payment recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating quick cash payment:", e);
        return { message: 'Database Error: Could not record cash payment.', success: false };
    }
}


export async function cancelCashPayment(paymentId: string): Promise<{ success: boolean; message?: string }> {
    if (!paymentId) {
        return { success: false, message: 'Payment ID is required.' };
    }

    try {
        const paymentRef = ref(db, `cash_payments/${paymentId}`);
        const paymentSnapshot = await get(paymentRef);

        if (!paymentSnapshot.exists()) {
            return { success: false, message: 'Payment not found.' };
        }
        
        const paymentData = paymentSnapshot.val() as CashPayment;

        if (paymentData.status === 'Cancelled') {
            return { success: true, message: 'Payment was already cancelled.' };
        }
        
        const updates: { [key: string]: any } = {};
        updates[`/cash_payments/${paymentId}/status`] = 'Cancelled';

        if (paymentData.journalEntryId) {
            const journalRef = ref(db, `journal_entries/${paymentData.journalEntryId}`);
            const journalSnapshot = await get(journalRef);
            if(journalSnapshot.exists()) {
                const journalData = journalSnapshot.val();
                const reversalJournalRef = push(ref(db, 'journal_entries'));
                updates[`/journal_entries/${reversalJournalRef.key}`] = {
                    date: new Date().toISOString(),
                    description: `Reversal for cash payment #${paymentId}`,
                    debit_account: journalData.credit_account,
                    credit_account: journalData.debit_account,
                    debit_amount: journalData.credit_amount,
                    credit_amount: journalData.debit_amount,
                    amount_usd: journalData.amount_usd,
                    createdAt: new Date().toISOString(),
                    debit_account_name: journalData.credit_account_name,
                    credit_account_name: journalData.debit_account_name,
                };
            }
        }
        
        await update(ref(db), updates);
        
        revalidatePath('/cash-payments');
        return { success: true, message: 'Payment cancelled and journal entry reversed.' };

    } catch (error) {
        console.error('Error cancelling payment:', error);
        return { success: false, message: 'Database error while cancelling payment.' };
    }
}

const ModernTransactionSchema = z.object({
  clientId: z.string().min(1, 'A client must be selected.'),
  linkedRecordIds: z.array(z.string()).min(1, 'At least one financial record must be selected.'),
  notes: z.string().optional(),
  attachment: z.instanceof(File).optional(),
});

export async function createModernTransaction(formData: FormData): Promise<{ success: boolean; message: string; }> {
    const dataToValidate = {
        clientId: formData.get('clientId'),
        linkedRecordIds: formData.getAll('linkedRecordIds'),
        notes: formData.get('notes'),
        attachment: formData.get('attachment'),
    };
    
    const validatedFields = ModernTransactionSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            success: false,
            message: validatedFields.error.flatten().fieldErrors.linkedRecordIds?.[0] || 'Invalid data submitted.',
        };
    }
    
    const { clientId, linkedRecordIds, notes, attachment } = validatedFields.data;
    const records = await getUnifiedClientRecords(clientId);
    const selectedRecords = records.filter(r => linkedRecordIds.includes(r.id));
    
    if (selectedRecords.length === 0) {
        return { success: false, message: "No valid records were selected." };
    }

    const totalInflowUSD = selectedRecords.filter(r => r.type === 'inflow').reduce((sum, r) => sum + r.amountUsd, 0);
    const totalOutflowUSD = selectedRecords.filter(r => r.type === 'outflow').reduce((sum, r) => sum + r.amountUsd, 0);

    const feesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));
    const feesSnapshot = await get(feesRef);
    const cryptoFees: any | null = feesSnapshot.exists() ? Object.values(feesSnapshot.val())[0] : null;

    const feePercent = cryptoFees ? cryptoFees.buy_fee_percent / 100 : 0.02;
    const minFee = cryptoFees ? cryptoFees.minimum_buy_fee : 1;

    const fee_usd = Math.max(totalInflowUSD * feePercent, totalInflowUSD > 0 ? minFee : 0);
    const amount_usdt = totalInflowUSD - totalOutflowUSD - fee_usd;
    
    const clientSnapshot = await get(ref(db, `clients/${clientId}`));
    if (!clientSnapshot.exists()) return { success: false, message: "Client not found." };
    
    const newTxId = await getNextSequentialId();

    const transactionData: Omit<Transaction, 'id'> = {
        date: new Date().toISOString(),
        type: 'Modern',
        clientId: clientId,
        clientName: clientSnapshot.val().name,
        amount_usd: totalInflowUSD,
        fee_usd,
        amount_usdt,
        status: 'Confirmed',
        notes: notes || '',
        createdAt: new Date().toISOString(),
        linkedRecordIds: linkedRecordIds.join(','),
    };

    const updates: { [key: string]: any } = {};
    updates[`/transactions/${newTxId}`] = transactionData;
    
    for (const recordId of linkedRecordIds) {
        const record = selectedRecords.find(r => r.id === recordId);
        if (record?.source === 'Manual') {
            updates[`/cash_receipts/${recordId}/status`] = 'Used';
        } else if (record?.source === 'USDT') {
             updates[`/usdt_receipts/${recordId}/status`] = 'Used'; 
        } else if (record?.source === 'Cash Payment') {
            updates[`/cash_payments/${recordId}/status`] = 'Used'; 
        } else if (record?.source === 'SMS') {
            updates[`/sms_transactions/${recordId}/status`] = 'used';
        }
    }

    try {
        await update(ref(db), updates);
        await logAction('create_modern_transaction', { type: 'transaction', id: String(newTxId), name: `Modern TX for ${transactionData.clientName}` }, transactionData);
        revalidatePath('/transactions/modern');
        revalidatePath(`/transactions`);
        return { success: true, message: `Transaction #${newTxId} created.` };
    } catch (error) {
        console.error("Modern transaction creation error:", error);
        return { success: false, message: "A database error occurred." };
    }
}
