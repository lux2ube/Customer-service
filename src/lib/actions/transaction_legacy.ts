

'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Transaction, CryptoFee } from '../types';
import { stripUndefined, logAction } from './helpers';
import { redirect } from 'next/navigation';
import { createJournalEntryFromTransaction } from './journal';

export type TransactionFormState =
  | {
      errors?: {
        clientId?: string[];
        bankAccountId?: string[];
        cryptoWalletId?: string[];
        currency?: string[];
        amount?: string[];
        remittance_number?: string[];
        hash?: string[];
        client_wallet_address?: string[];
        status?: string[];
        linkedSmsId?: string[];
      };
      message?: string;
      success?: boolean;
      transactionId?: string;
    }
  | undefined;

const TransactionSchema = z.object({
  id: z.string().optional(),
  date: z.string().transform((str) => new Date(str).toISOString()),
  type: z.enum(['Deposit', 'Withdraw']),
  clientId: z.string().min(1, 'Client is required.'),
  bankAccountId: z.string().optional(),
  cryptoWalletId: z.string().min(1, 'A system crypto wallet must be selected.'),
  currency: z.string().min(1, 'Currency is required.'),
  amount: z.coerce.number().gt(0, { message: 'Amount must be greater than zero.' }),
  amount_usd: z.coerce.number(),
  fee_usd: z.coerce.number(),
  expense_usd: z.coerce.number().optional(),
  outflow_usd: z.coerce.number(),
  notes: z.string().optional(),
  remittance_number: z.string().optional(),
  hash: z.string().optional(),
  client_wallet_address: z.string().optional(),
  status: z.enum(['Pending', 'Confirmed', 'Cancelled']),
  linkedSmsId: z.string().optional(),
  exchange_rate_commission: z.coerce.number().optional(),
  attachment_url: z.string().optional(),
});

export async function createTransaction(transactionId: string | null, formData: FormData) {
  const isEditing = !!transactionId;

  // Manual parsing for now
  const rawData = {
    date: formData.get('date'),
    type: formData.get('type'),
    clientId: formData.get('clientId'),
    bankAccountId: formData.get('bankAccountId'),
    cryptoWalletId: formData.get('cryptoWalletId'),
    currency: formData.get('currency'),
    amount: formData.get('amount'),
    amount_usd: formData.get('amount_usd'),
    fee_usd: formData.get('fee_usd'),
    expense_usd: formData.get('expense_usd'),
    outflow_usd: formData.get('outflow_usd'),
    notes: formData.get('notes'),
    remittance_number: formData.get('remittance_number'),
    hash: formData.get('hash'),
    client_wallet_address: formData.get('client_wallet_address'),
    status: formData.get('status'),
    linkedSmsId: formData.get('linkedSmsId'),
    exchange_rate_commission: formData.get('exchange_rate_commission'),
    attachment_url: formData.get('attachment_url')
  };

  const validatedFields = TransactionSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Failed to save transaction. Please check the fields.',
    };
  }

  const data = validatedFields.data;
  let newTransactionId = transactionId || '';

  try {
    const attachmentFile = formData.get('attachment_url_input') as File;
    if (attachmentFile && attachmentFile.size > 0) {
      const filePath = `transaction_attachments/${newTransactionId || 'new'}/${attachmentFile.name}`;
      const fileRef = storageRef(storage, filePath);
      await uploadBytes(fileRef, attachmentFile);
      data.attachment_url = await getDownloadURL(fileRef);
    }
    
    // Upload invoice image if present
    const invoiceImageBlob = formData.get('invoice_image') as Blob;
    if (invoiceImageBlob && invoiceImageBlob.size > 0 && newTransactionId) {
        const filePath = `invoice_images/${newTransactionId}.png`;
        const fileRef = storageRef(storage, filePath);
        await uploadBytes(fileRef, invoiceImageBlob);
        // We'll update this field later after we know the ID
    }


    // Denormalize client and account names
    const [clientSnapshot, bankAccountSnapshot, cryptoWalletSnapshot] = await Promise.all([
      get(ref(db, `clients/${data.clientId}`)),
      data.bankAccountId ? get(ref(db, `accounts/${data.bankAccountId}`)) : Promise.resolve(null),
      get(ref(db, `accounts/${data.cryptoWalletId}`))
    ]);

    const clientName = (clientSnapshot.val() as Client)?.name || '';
    const bankAccountName = (bankAccountSnapshot?.val() as Account)?.name || '';
    const cryptoWalletName = (cryptoWalletSnapshot.val() as Account)?.name || '';
    
    const finalData = {
        ...data,
        clientName,
        bankAccountName,
        cryptoWalletName,
    };
    
    let oldData = null;

    if (isEditing) {
      const txRef = ref(db, `transactions/${transactionId}`);
      const oldSnapshot = await get(txRef);
      oldData = oldSnapshot.val();
      await update(txRef, stripUndefined(finalData));
    } else {
      const newTransactionRef = push(ref(db, 'transactions'));
      newTransactionId = newTransactionRef.key!;
      await set(newTransactionRef, {
        ...stripUndefined(finalData),
        id: newTransactionId,
        createdAt: new Date().toISOString(),
      });
    }
    
    // Update invoice image URL now that we have the ID
    if (invoiceImageBlob && newTransactionId) {
        const filePath = `invoice_images/${newTransactionId}.png`;
        const fileRef = storageRef(storage, filePath);
        const downloadURL = await getDownloadURL(fileRef);
        await update(ref(db, `transactions/${newTransactionId}`), { invoice_image_url: downloadURL });
    }

    // --- Journal Entry Creation ---
    if (data.status === 'Confirmed') {
        let legs: { accountId: string, debit: number, credit: number }[] = [];
        let journalDescription: string;
        
        // Every transaction affects the client's liability account
        const clientAccountId = `6000${data.clientId}`;

        if (data.type === 'Deposit') {
            journalDescription = `Deposit for ${clientName} (Tx: ${newTransactionId})`;
            // Client gave us fiat (e.g. USD), which is an asset for us. This reduces our liability to the client.
            if(data.bankAccountId) legs.push({ accountId: data.bankAccountId, debit: data.amount_usd, credit: 0 }); // Debit Bank Asset
            legs.push({ accountId: clientAccountId, debit: 0, credit: data.amount_usd }); // Credit Client Liability

            // We gave them USDT, which is an asset for us. This increases our liability.
            legs.push({ accountId: data.cryptoWalletId, debit: 0, credit: data.outflow_usd }); // Credit USDT Asset
            legs.push({ accountId: clientAccountId, debit: data.outflow_usd, credit: 0 }); // Debit Client Liability

        } else { // Withdraw
             journalDescription = `Withdrawal for ${clientName} (Tx: ${newTransactionId})`;
            // Client gave us USDT, asset increases, liability to them reduces.
            legs.push({ accountId: data.cryptoWalletId, debit: data.outflow_usd, credit: 0 }); // Debit USDT Asset
            legs.push({ accountId: clientAccountId, debit: 0, credit: data.outflow_usd }); // Credit Client Liability
            
            // We gave them fiat, asset decreases, liability increases.
            if(data.bankAccountId) legs.push({ accountId: data.bankAccountId, debit: 0, credit: data.amount_usd }); // Credit Bank Asset
            legs.push({ accountId: clientAccountId, debit: data.amount_usd, credit: 0 }); // Debit Client Liability
        }
        
        // Fee income
        if (data.fee_usd > 0) {
            legs.push({ accountId: '4002', debit: 0, credit: data.fee_usd }); // Credit Fee Income
            legs.push({ accountId: clientAccountId, debit: data.fee_usd, credit: 0 }); // Debit Client Liability
        }

        // Expense / Discount
        if (data.expense_usd && data.expense_usd > 0) {
            legs.push({ accountId: '5002', debit: data.expense_usd, credit: 0 }); // Debit Expense/Discount
            legs.push({ accountId: clientAccountId, debit: 0, credit: data.expense_usd }); // Credit Client Liability
        }

        await createJournalEntryFromTransaction(journalDescription, legs);
    }

    // Update the linked SMS transaction's status
    if (data.linkedSmsId) {
      await update(ref(db, `sms_transactions/${data.linkedSmsId}`), {
        status: 'used',
        transaction_id: newTransactionId,
      });
      revalidatePath('/sms/transactions');
    }

    revalidatePath('/transactions');
    revalidatePath('/accounting/journal');
    if (isEditing) {
      revalidatePath(`/transactions/${transactionId}/edit`);
    }

    return { success: true, message: 'Transaction saved.', transactionId: newTransactionId };
  } catch (error) {
    console.error("Create Transaction Error:", error);
    return { message: 'Database error: Could not create transaction.' };
  }
}
