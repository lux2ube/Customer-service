
'use server';

import { db } from '../firebase';
import { ref, update, get } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction } from '../types';

export type AutoProcessState = { message?: string; error?: boolean; } | undefined;

export async function autoProcessSyncedTransactions(prevState: AutoProcessState, formData: FormData): Promise<AutoProcessState> {
     try {
        const [transactionsSnapshot, smsTransactionsSnapshot] = await Promise.all([
            get(ref(db, 'transactions')),
            get(ref(db, 'sms_transactions'))
        ]);

        if (!transactionsSnapshot.exists() || !smsTransactionsSnapshot.exists()) {
            return { message: "No transactions or SMS records found to process.", error: false };
        }

        const allTransactions: Record<string, Transaction> = transactionsSnapshot.val();
        const allSmsTransactions: Record<string, SmsTransaction> = smsTransactionsSnapshot.val();
        
        const pendingBscTxs = Object.values(allTransactions).filter(tx => tx.clientId === 'unassigned-bscscan' && tx.type === 'Deposit');
        const matchedSmsTxs = Object.values(allSmsTransactions).filter(sms => sms.status === 'matched');

        if (pendingBscTxs.length === 0) {
            return { message: "No unassigned BscScan deposits to process.", error: false };
        }

        const updates: { [key: string]: any } = {};
        let processedCount = 0;

        for (const bscTx of pendingBscTxs) {
            // Find a matched SMS for the same amount (+/- a small tolerance for fees)
            // This is a naive approach and could be improved with more sophisticated matching logic
            const matchedSms = matchedSmsTxs.find(sms => 
                Math.abs(sms.amount! - bscTx.amount_usd) < 1 // tolerance of $1
            );
            
            if (matchedSms && matchedSms.matched_client_id) {
                // Found a match, update the BscScan transaction with the client details
                updates[`/transactions/${bscTx.id}/clientId`] = matchedSms.matched_client_id;
                updates[`/transactions/${bscTx.id}/clientName`] = matchedSms.matched_client_name;
                updates[`/transactions/${bscTx.id}/linkedSmsId`] = matchedSms.id;
                
                // Mark the SMS as used
                updates[`/sms_transactions/${matchedSms.id}/status`] = 'used';
                updates[`/sms_transactions/${matchedSms.id}/transaction_id`] = bscTx.id;
                
                processedCount++;
            }
        }
        
        if (processedCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        revalidatePath('/sms/transactions');
        return { message: `Auto-processing complete. Successfully linked ${processedCount} deposit(s).`, error: false };

    } catch (error: any) {
        console.error("Auto-Process Error:", error);
        return { message: error.message || "An unknown error occurred during auto-processing.", error: true };
    }
}
