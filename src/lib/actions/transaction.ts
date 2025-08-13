
'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, FiatRate, UnifiedReceipt, CashPayment, UsdtManualReceipt, UnifiedFinancialRecord, UsdtPayment, SendRequest, ServiceProvider, ClientServiceProvider, ModernCashRecord, ModernUsdtRecord, JournalEntry } from '../types';
import { stripUndefined, sendTelegramNotification, sendTelegramPhoto, logAction, getNextSequentialId } from './helpers';
import { redirect } from 'next/navigation';

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
    if (finalData.status === 'Confirmed' && client && (finalData.bankAccountId || finalData.client_wallet_address)) {
        const serviceProvidersSnapshot = await get(ref(db, 'service_providers'));
        if (serviceProvidersSnapshot.exists()) {
            const allProviders: Record<string, ServiceProvider> = serviceProvidersSnapshot.val();
            const accountIdToCheck = finalData.bankAccountId || finalData.cryptoWalletId;

            if (accountIdToCheck) {
                const providerEntry = Object.entries(allProviders).find(([, p]) => p.accountIds.includes(accountIdToCheck));

                if (providerEntry) {
                    const [providerId, provider] = providerEntry;
                    const newMethodDetails: Record<string, string> = {};

                    if (provider.type === 'Bank' && provider.bankFormula) {
                        if (provider.bankFormula.includes('Client Name') && client.name) newMethodDetails['Client Name'] = client.name;
                        if (provider.bankFormula.includes('Phone Number') && client.phone?.[0]) newMethodDetails['Phone Number'] = client.phone[0];
                        if (provider.bankFormula.includes('ID') && client.id) newMethodDetails['ID'] = client.id;
                    } else if (provider.type === 'Crypto' && provider.cryptoFormula) {
                        if (provider.cryptoFormula.includes('Address') && finalData.client_wallet_address) newMethodDetails['Address'] = finalData.client_wallet_address;
                        if (provider.cryptoFormula.includes('ID') && client.id) newMethodDetails['ID'] = client.id;
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

const FullCashReceiptSchema = z.object({
    date: z.string().optional(),
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to credit.'),
    senderName: z.string().min(1, 'Sender name is required.'),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    amountUsd: z.coerce.number().gt(0, 'USD Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});

const EditCashRecordSchema = z.object({
    clientId: z.string().min(1, 'A client must be selected.'),
    note: z.string().optional(),
    remittanceNumber: z.string().optional(),
});

export async function createCashReceipt(recordId: string | null, prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const isEditing = !!recordId;

    if (isEditing) {
        const validatedFields = EditCashRecordSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to update record.' };
        }
        
        try {
            const recordSnapshot = await get(ref(db, `modern_cash_records/${recordId}`));
            if (!recordSnapshot.exists()) {
                return { message: 'Record not found.', success: false };
            }
            const existingRecord: ModernCashRecord = { id: recordId, ...recordSnapshot.val() };
            const { clientId, note, remittanceNumber } = validatedFields.data;

            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            if (!clientSnapshot.exists()) {
                 return { message: 'Selected client not found.', success: false };
            }

            const updatedData = {
                ...existingRecord,
                clientId: clientId,
                clientName: clientSnapshot.val().name,
                notes: note || existingRecord.notes,
                remittanceNumber: remittanceNumber || existingRecord.notes,
                status: existingRecord.source === 'SMS' ? 'Matched' : 'Pending' as ModernCashRecord['status'],
            };
            await update(ref(db, `modern_cash_records/${recordId}`), updatedData);
            revalidatePath('/modern-cash-records');
            redirect('/modern-cash-records');

        } catch (e: any) {
            console.error("Error updating cash receipt:", e);
            return { message: 'Database Error: Could not update cash receipt.', success: false };
        }
        // This was the missing return. The function would fall through if isEditing was true.
        redirect('/modern-cash-records');
    } else {
        const validatedFields = FullCashReceiptSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record receipt.' };
        }
        const { bankAccountId, clientId, senderName, amount, amountUsd, remittanceNumber, note, date } = validatedFields.data;
        
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

            const receiptData: Omit<ModernCashRecord, 'id'> = {
                date: date || new Date().toISOString(),
                clientId,
                clientName: client.name,
                accountId: bankAccountId,
                accountName: bankAccount.name,
                senderName,
                amount,
                currency: bankAccount.currency!,
                amountUsd,
                notes: note || undefined,
                type: 'inflow',
                source: 'Manual',
                status: 'Pending',
                createdAt: new Date().toISOString(),
            };

            const finalData = stripUndefined(receiptData);
            
            const updates: { [key: string]: any } = {};
            updates[`/modern_cash_records/${newReceiptId}`] = finalData;
            
            const clientAccountId = `6000${clientId}`;
            const journalRef = push(ref(db, 'journal_entries'));
            const journalEntry: Omit<JournalEntry, 'id'> = {
                date: date || new Date().toISOString(),
                description: `Cash Receipt from ${senderName} for ${client.name} - Ref: ${newReceiptId}`,
                debit_account: bankAccountId,
                credit_account: clientAccountId,
                debit_amount: amount,
                credit_amount: amount, // Credit amount is in the currency of the credited account (client account is USD)
                amount_usd: amountUsd,
                createdAt: new Date().toISOString(),
                debit_account_name: bankAccount.name,
                credit_account_name: client.name,
            };
            updates[`/journal_entries/${journalRef.key}`] = journalEntry;

            await update(ref(db), updates);
            
            revalidatePath('/modern-cash-records');
            return { success: true, message: `Cash receipt recorded successfully.` };
        } catch (e: any) {
            console.error("Error creating cash receipt:", e);
            return { message: 'Database Error: Could not record cash receipt.', success: false };
        }
    }
}


export type CashPaymentFormState = {
  errors?: { bankAccountId?: string[]; clientId?: string[]; amount?: string[]; recipientName?: string[]; };
  message?: string;
  success?: boolean;
} | undefined;

const FullCashPaymentSchema = z.object({
    date: z.string().optional(),
    bankAccountId: z.string().min(1, 'Please select a bank account.'),
    clientId: z.string().min(1, 'Please select a client to debit from.'),
    recipientName: z.string().optional(),
    amount: z.coerce.number().gt(0, 'Amount must be greater than zero.'),
    amountUsd: z.coerce.number().gt(0, 'USD Amount must be greater than zero.'),
    remittanceNumber: z.string().optional(),
    note: z.string().optional(),
});


export async function createCashPayment(paymentId: string | null, prevState: CashPaymentFormState, formData: FormData): Promise<CashPaymentFormState> {
    const isEditing = !!paymentId;
    
    if (isEditing) {
        const validatedFields = EditCashRecordSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to update record.' };
        }

        try {
            const recordSnapshot = await get(ref(db, `modern_cash_records/${paymentId}`));
            if (!recordSnapshot.exists()) return { message: 'Record not found.', success: false };

            const existingRecord: ModernCashRecord = { id: paymentId, ...recordSnapshot.val() };
            const { clientId, note, remittanceNumber } = validatedFields.data;

            const clientSnapshot = await get(ref(db, `clients/${clientId}`));
            if (!clientSnapshot.exists()) return { message: 'Selected client not found.', success: false };

            const updatedData = {
                ...existingRecord,
                clientId: clientId,
                clientName: clientSnapshot.val().name,
                notes: note || existingRecord.notes,
                remittanceNumber: remittanceNumber || existingRecord.notes, // Assuming notes field was used for this
                status: existingRecord.source === 'SMS' ? 'Matched' : 'Pending' as ModernCashRecord['status'],
            };
            await update(ref(db, `modern_cash_records/${paymentId}`), updatedData);
            revalidatePath('/modern-cash-records');
            redirect('/modern-cash-records');

        } catch (e: any) {
            return { message: 'Database Error: Could not update cash payment.', success: false };
        }
        // This was the missing return. The function would fall through if isEditing was true.
        redirect('/modern-cash-records');
    } else {
        const validatedFields = FullCashPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
        if (!validatedFields.success) {
            return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record payment.' };
        }

        const { bankAccountId, clientId, recipientName, amount, amountUsd, remittanceNumber, note, date } = validatedFields.data;
        
        try {
            const [bankAccountSnapshot, clientSnapshot] = await Promise.all([
                get(ref(db, `accounts/${bankAccountId}`)),
                get(ref(db, `clients/${clientId}`)),
            ]);
            
            if (!bankAccountSnapshot.exists()) return { message: 'Bank account not found.', success: false };
            if (!clientSnapshot.exists()) return { message: 'Client not found.', success: false };

            const bankAccount = { id: bankAccountId, ...bankAccountSnapshot.val() } as Account;
            const client = { id: clientId, ...clientSnapshot.val() } as Client;

            const newPaymentId = await getNextSequentialId('modernCashRecordId');
            
            const paymentData: Omit<ModernCashRecord, 'id'> = {
                date: date || new Date().toISOString(),
                clientId,
                clientName: client.name,
                accountId: bankAccountId,
                accountName: bankAccount.name,
                recipientName: recipientName || client.name,
                amount,
                currency: bankAccount.currency!,
                amountUsd,
                notes: note || undefined,
                type: 'outflow',
                source: 'Manual',
                status: 'Pending',
                createdAt: new Date().toISOString(),
            };
            
            const finalData = stripUndefined(paymentData);
            
            const updates: { [key: string]: any } = {};
            updates[`/modern_cash_records/${newPaymentId}`] = finalData;

            const clientAccountId = `6000${clientId}`;
            const journalRef = push(ref(db, 'journal_entries'));
            const journalEntry: Omit<JournalEntry, 'id'> = {
                date: date || new Date().toISOString(),
                description: `Cash Payment to ${recipientName || client.name} from ${client.name} - Ref: ${newPaymentId}`,
                debit_account: clientAccountId,
                credit_account: bankAccountId,
                debit_amount: amountUsd,
                credit_amount: amount,
                amount_usd: amountUsd,
                createdAt: new Date().toISOString(),
                debit_account_name: client.name,
                credit_account_name: bankAccount.name,
            };
            updates[`/journal_entries/${journalRef.key}`] = journalEntry;
            
            await update(ref(db), updates);
            
            revalidatePath('/modern-cash-records');
            redirect('/modern-cash-records');
           
        } catch (e: any) {
            console.error("Error creating cash payment:", e);
            return { message: 'Database Error: Could not record cash payment.', success: false };
        }
    }
}

export async function createQuickCashPayment(prevState: CashPaymentFormState, formData: FormData): Promise<CashPaymentFormState> {
    const validatedFields = FullCashPaymentSchema.safeParse(Object.fromEntries(formData.entries()));
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

export async function createQuickCashReceipt(prevState: CashReceiptFormState, formData: FormData): Promise<CashReceiptFormState> {
    const validatedFields = FullCashReceiptSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { errors: validatedFields.error.flatten().fieldErrors, message: 'Failed to record receipt.' };
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
            senderName: client.name, // Assuming client is the sender for quick add
            amount,
            currency: bankAccount.currency!,
            amountUsd,
            createdAt: new Date().toISOString(),
        };

        await set(ref(db, `modern_cash_records/${newReceiptId}`), stripUndefined(receiptData));
        revalidatePath('/transactions/modern'); // To refresh the modern transaction form
        return { success: true, message: 'Cash receipt recorded successfully.' };
    } catch (e: any) {
        console.error("Error creating quick cash receipt:", e);
        return { message: 'Database Error: Could not record cash receipt.', success: false };
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
  type: z.enum(['Deposit', 'Withdraw', 'Transfer']),
  notes: z.string().optional(),
  attachment: z.instanceof(File).optional(),
});

export async function getUnifiedClientRecords(clientId: string): Promise<UnifiedFinancialRecord[]> {
    if (!clientId) return [];

    const allRecords: UnifiedFinancialRecord[] = [];
    
    // Fetch cash records
    const cashRecordsRef = query(ref(db, 'modern_cash_records'), orderByChild('clientId'), equalTo(clientId));
    const cashSnapshot = await get(cashRecordsRef);
    if (cashSnapshot.exists()) {
        const clientCashRecords: Record<string, ModernCashRecord> = cashSnapshot.val();
        for (const recordId in clientCashRecords) {
            const record = clientCashRecords[recordId];
            if (record.clientId === clientId && record.status !== 'Used' && record.status !== 'Cancelled') {
                 allRecords.push({
                    id: recordId,
                    date: record.date,
                    type: record.type,
                    category: 'fiat',
                    source: record.source,
                    amount: record.amount,
                    currency: record.currency,
                    amountUsd: record.amountUsd,
                    status: record.status,
                    bankAccountName: record.accountName,
                    senderName: record.senderName || record.recipientName,
                });
            }
        }
    }
    
    // Fetch USDT records
    const usdtRecordsRef = query(ref(db, 'modern_usdt_records'), orderByChild('clientId'), equalTo(clientId));
    const usdtSnapshot = await get(usdtRecordsRef);
    if (usdtSnapshot.exists()) {
        const clientUsdtRecords: Record<string, ModernUsdtRecord> = usdtSnapshot.val();
        for (const recordId in clientUsdtRecords) {
            const record = clientUsdtRecords[recordId];
            if (record.clientId === clientId && record.status !== 'Used' && record.status !== 'Cancelled') {
                 allRecords.push({
                    id: recordId,
                    date: record.date,
                    type: record.type,
                    category: 'crypto',
                    source: record.source,
                    amount: record.amount,
                    currency: 'USDT',
                    amountUsd: record.amount, // For USDT, amount is amountUsd
                    status: record.status,
                    cryptoWalletName: record.accountName,
                });
            }
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
        type: formData.get('type'),
        attachment: formData.get('attachment'),
    };
    
    const validatedFields = ModernTransactionSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return {
            success: false,
            message: validatedFields.error.flatten().fieldErrors.linkedRecordIds?.[0] || 'Invalid data submitted.',
        };
    }
    
    const { clientId, linkedRecordIds, notes, type, attachment } = validatedFields.data;
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
    
    let baseAmountForFee = 0;
    if (type === 'Deposit') {
        baseAmountForFee = selectedRecords
            .filter(r => r.type === 'inflow' && r.category === 'fiat')
            .reduce((sum, r) => sum + r.amountUsd, 0);
    } else if (type === 'Withdraw') {
         baseAmountForFee = selectedRecords
            .filter(r => r.type === 'inflow' && r.category === 'crypto')
            .reduce((sum, r) => sum + r.amountUsd, 0);
    } else { // Transfer
        baseAmountForFee = totalInflowUSD;
    }


    const feePercent = (type === 'Deposit' ? (cryptoFees?.buy_fee_percent || 0) : (cryptoFees?.sell_fee_percent || 0)) / 100;
    const minFee = type === 'Deposit' ? (cryptoFees?.minimum_buy_fee || 0) : (cryptoFees?.minimum_sell_fee || 0);

    const fee_usd = Math.max(baseAmountForFee * feePercent, baseAmountForFee > 0 ? minFee : 0);
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
        if (record?.category === 'fiat') {
            updates[`/modern_cash_records/${recordId}/status`] = 'Used';
        } else if (record?.category === 'crypto') {
            updates[`/modern_usdt_records/${recordId}/status`] = 'Used';
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

    