

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get, query, limitToLast, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, BlacklistItem, CashReceipt, FiatRate, UnifiedReceipt, CashPayment, UsdtManualReceipt, UnifiedFinancialRecord, UsdtPayment, SendRequest, ServiceProvider, ClientServiceProvider, CashRecord, UsdtRecord, JournalEntry } from '../types';
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
            updates[`/cash_records/${id}/status`] = 'Used';
        }
        await update(ref(db), updates);
    }
    
    revalidatePath('/transactions');
    revalidatePath(`/clients/${finalData.clientId}/edit`);
    revalidatePath(`/transactions/add`);
    revalidatePath('/cash-records');
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
