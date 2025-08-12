
'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, FiatRate, UnifiedReceipt, CashPayment, UsdtManualReceipt, UnifiedFinancialRecord, UsdtPayment, SendRequest, ServiceProvider, ClientServiceProvider, ModernCashRecord } from '../types';
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
    const newId = transactionId || await getNextSequentialId('globalRecordId');
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

    const clientRef = ref(db, `clients/${dataToSave.clientId}`);
    let clientSnapshot = await get(clientRef);
    let client = clientSnapshot.exists() ? { id: dataToSave.clientId, ...clientSnapshot.val() } as Client : null;

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
        clientName: client?.name || 'Unknown Client',
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

    // --- Start: Auto-save payment methods to client profile ---
    if (finalData.status === 'Confirmed' && client && finalData.bankAccountId) {
        const serviceProvidersSnapshot = await get(ref(db, 'service_providers'));
        if (serviceProvidersSnapshot.exists()) {
            const allProviders: Record<string, ServiceProvider> = serviceProvidersSnapshot.val();
            const providerEntry = Object.entries(allProviders).find(([, p]) => p.accountIds.includes(finalData.bankAccountId!));

            if (providerEntry) {
                const [providerId, provider] = providerEntry;
                const newMethodDetails: Record<string, string> = {};

                if (provider.bankFormula) {
                    if (provider.bankFormula.includes('Client Name') && client.name) newMethodDetails['Client Name'] = client.name;
                    if (provider.bankFormula.includes('Phone Number') && client.phone?.[0]) newMethodDetails['Phone Number'] = client.phone[0];
                    if (provider.bankFormula.includes('ID') && client.id) newMethodDetails['ID'] = client.id;
                }
                
                if (Object.keys(newMethodDetails).length > 0) {
                    const newServiceProviderRecord: ClientServiceProvider = {
                        providerId: providerId,
                        providerName: provider.name,
                        providerType: provider.type,
                        details: newMethodDetails,
                    };
                    
                    const existingProviders = client.serviceProviders || [];
                    const isDuplicate = existingProviders.some(p => JSON.stringify(p.details) === JSON.stringify(newMethodDetails) && p.providerId === providerId);

                    if (!isDuplicate) {
                        const updatedProviders = [...existingProviders, newServiceProviderRecord];
                        await update(ref(db, `clients/${client.id}`), { serviceProviders: updatedProviders });
                    }
                }
            }
        }
    }
     // --- End: Auto-save payment methods ---


    if (finalData.clientId && finalData.client_wallet_address) {
        try {
            if (!client) {
                 const newClientSnapshot = await get(ref(db, `clients/${finalData.clientId}`));
                 client = newClientSnapshot.exists() ? {id: finalData.clientId, ...newClientSnapshot.val()} : null;
            }
            if (client) {
                const existingAddresses = client.bep20_addresses || [];
                const newAddress = finalData.client_wallet_address;
                if (!existingAddresses.some(addr => addr.toLowerCase() === newAddress.toLowerCase())) {
                    await update(ref(db, `clients/${client.id}`), { bep20_addresses: [...existingAddresses, newAddress] });
                }
            }
        } catch (e) {
            console.error(`Failed to update BEP20 address for client ${finalData.clientId}:`, e);
        }
    }
    
    if (dataToSave.linkedReceiptIds && dataToSave.linkedReceiptIds.length > 0) {
        const updates: {[key: string]: any} = {};
        for (const id of dataToSave.linkedReceiptIds) {
            updates[`/modern_cash_records/${id}/status`] = 'Used';
            updates[`/sms_transactions/${id}/status`] = 'used'; // Keep for backwards compatibility if needed
        }
        await update(ref(db), updates);
    }
    
    revalidatePath('/transactions');
    revalidatePath(`/clients/${finalData.clientId}/edit`);
    revalidatePath(`/transactions/add`);
    revalidatePath('/modern-cash-records');
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
  errors?: { bankAccountId?: string[]; clientId?: string[]; amount?: string[]; clientName?: string[]; senderName?: string; };
  message?: string;
  success?: boolean;
} | undefined;

const CashReceiptSchema = z.object({
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to credit.'),
    senderName: z.string().min(1, 'Sender name is required.'),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    amountUsd: z.coerce.number().gt(0, 'USD Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});

export async function createQuickCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = CashReceiptSchema.safeParse({
        ...Object.fromEntries(formData.entries()),
        senderName: formData.get('clientName')
    });

    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record receipt.' };
    }

    const { bankAccountId, clientId, senderName, amount, amountUsd, remittanceNumber } = validatedFields.data;
    try {
        const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`))
        ]);

        if (!bankAccountSnapshot.exists()) return { message: 'Error: Could not find bank account.', success: false };
        if (!clientSnapshot.exists()) return { message: 'Error: Could not find client.', success: false };

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;

        const newId = await getNextSequentialId('modernCashRecordId');
        
        const receiptData: ModernCashRecord = {
            id: newId,
            date: new Date().toISOString(),
            type: 'inflow',
            source: 'Manual',
            status: 'Pending',
            clientId,
            clientName: client.name,
            accountId: bankAccountId,
            accountName: bankAccount.name,
            senderName,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `modern_cash_records/${newId}`), stripUndefined(receiptData));
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

    const { bankAccountId, clientId, senderName, amount, amountUsd, remittanceNumber, note } = validatedFields.data;
    
    try {
        const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `accounts/${bankAccountId}`)),
            get(ref(db, `clients/${clientId}`))
        ]);
        
        if (!bankAccountSnapshot.exists()) return { message: 'Error: Could not find bank account.', success: false };
        if (!clientSnapshot.exists()) return { message: 'Error: Could not find client.', success: false };

        const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
        const client = { id: clientId, ...clientSnapshot.val() } as Client;
        
        const newReceiptId = await getNextSequentialId('modernCashRecordId');

        const receiptData: ModernCashRecord = {
            id: newReceiptId,
            date: new Date().toISOString(),
            type: 'inflow',
            source: 'Manual',
            status: 'Pending',
            clientId,
            clientName: client.name,
            accountId: bankAccountId,
            accountName: bankAccount.name,
            senderName,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            notes: note || undefined,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `modern_cash_records/${newReceiptId}`), stripUndefined(receiptData));
        
        revalidatePath('/modern-cash-records');
        redirect('/modern-cash-records');
    } catch (e: any) {
        console.error("Error creating cash receipt:", e);
        return { message: 'Database Error: Could not record cash receipt.', success: false };
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

        const newPaymentId = paymentId || await getNextSequentialId('modernCashRecordId');
        
        const paymentData: ModernCashRecord = {
            id: newPaymentId,
            date: new Date().toISOString(),
            type: 'outflow',
            source: 'Manual',
            status: 'Pending',
            clientId,
            clientName: client.name,
            accountId: bankAccountId,
            accountName: bankAccount.name,
            recipientName: recipientName || client.name,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            notes: note || undefined,
            createdAt: new Date().toISOString(),
        };
        
        await set(ref(db, `modern_cash_records/${newPaymentId}`), stripUndefined(paymentData));
        
        revalidatePath('/modern-cash-records');
        if (paymentId) {
             redirect('/cash-payments'); // old path, but keep for now
        } else {
             redirect('/modern-cash-records');
        }
       
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

        const newPaymentId = await getNextSequentialId('modernCashRecordId');
        const paymentData: ModernCashRecord = {
            id: newPaymentId,
            date: new Date().toISOString(),
            type: 'outflow',
            source: 'Manual',
            status: 'Pending',
            clientId,
            clientName: client.name,
            accountId: bankAccountId,
            accountName: bankAccount.name,
            recipientName: client.name,
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `modern_cash_records/${newPaymentId}`), stripUndefined(paymentData));
        revalidatePath('/transactions/modern'); // To refresh the modern transaction form
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
        const paymentRef = ref(db, `modern_cash_records/${paymentId}`);
        const paymentSnapshot = await get(paymentRef);

        if (!paymentSnapshot.exists()) {
            return { success: false, message: 'Payment not found.' };
        }
        
        await update(paymentRef, { status: 'Cancelled' });
        
        revalidatePath('/modern-cash-records');
        return { success: true, message: 'Payment cancelled.' };

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

export async function getUnifiedClientRecords(clientId: string): Promise<UnifiedFinancialRecord[]> {
    if (!clientId) return [];

    const recordsRef = query(ref(db, 'modern_cash_records'), orderByChild('clientId'), get(clientId));
    const snapshot = await get(recordsRef);
    if (!snapshot.exists()) return [];
    
    const allRecords: UnifiedFinancialRecord[] = [];
    const clientRecords: Record<string, ModernCashRecord> = snapshot.val();

    for (const recordId in clientRecords) {
        const record = clientRecords[recordId];
        // Double check client ID as firebase queries on nested data are not exact
        if (record.clientId === clientId && record.status === 'Pending') {
             allRecords.push({
                id: record.id,
                date: record.date,
                type: record.type,
                category: record.currency === 'USDT' ? 'crypto' : 'fiat',
                source: record.source,
                amount: record.amount,
                currency: record.currency,
                amountUsd: record.amountUsd,
                status: record.status,
                bankAccountName: record.currency !== 'USDT' ? record.accountName : undefined,
                cryptoWalletName: record.currency === 'USDT' ? record.accountName : undefined,
            });
        }
    }
    
    allRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allRecords;
}

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
    
    const newTxId = await getNextSequentialId('globalRecordId');

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
        // This logic needs to be updated for modern_cash_records
        updates[`/modern_cash_records/${recordId}/status`] = 'Used';
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
