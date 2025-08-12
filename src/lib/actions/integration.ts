

'use server';

import { db } from '../firebase';
import { push, ref, update, get } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, BscApiSetting } from '../types';
import { stripUndefined } from './helpers';

export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

export async function syncBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    try {
        const apiSettingsSnapshot = await get(ref(db, 'bsc_apis'));
        if (!apiSettingsSnapshot.exists()) {
            return { message: 'No BSC API configurations found. Please add one in Settings.', error: true };
        }
        const apiSettings: Record<string, BscApiSetting> = apiSettingsSnapshot.val();

        let totalNewTxCount = 0;
        
        const transactionsSnapshot = await get(ref(db, 'transactions'));
        const existingTxs = transactionsSnapshot.val() || {};
        const existingHashes = new Set(Object.values(existingTxs).map((tx: any) => tx.hash));

        const clientsSnapshot = await get(ref(db, 'clients'));
        const clientsData: Record<string, Client> = clientsSnapshot.val() || {};
        const addressToClientMap: Record<string, { id: string, name: string }> = {};
        for (const clientId in clientsData) {
            const client = clientsData[clientId];
            if (client.bep20_addresses) {
                for (const address of client.bep20_addresses) {
                    addressToClientMap[address.toLowerCase()] = { id: clientId, name: client.name };
                }
            }
        }
        
        const updates: { [key: string]: any } = {};

        for (const setting of Object.values(apiSettings)) {
            const { apiKey, walletAddress, accountId, name } = setting;
            if (!apiKey || !walletAddress) {
                console.warn(`Skipping API config "${name}" due to missing key or address.`);
                continue;
            }

            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${walletAddress}&page=1&offset=200&sort=desc&apikey=${apiKey}`;
            
            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error(`BscScan API request failed for ${name}: ${response.statusText}`);
                continue;
            }
            const data = await response.json();
            
            if (data.status !== "1") {
                console.warn(`BscScan API Error for ${name}: ${data.message}`);
                continue;
            }

            const walletAccountRef = ref(db, `accounts/${accountId}`);
            const walletAccountSnapshot = await get(walletAccountRef);
            const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';
            
            for (const tx of data.result) {
                if (existingHashes.has(tx.hash)) continue;

                const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
                if (syncedAmount <= 0.01) continue;

                const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
                const transactionType = isIncoming ? 'Withdraw' : 'Deposit';
                const clientAddress = isIncoming ? tx.from : tx.to;
                const foundClient = addressToClientMap[clientAddress.toLowerCase()];

                const newTxId = push(ref(db, 'transactions')).key;
                if (!newTxId) continue;
                
                const note = `Synced from ${name}. From: ${tx.from}. To: ${tx.to}`;

                const newTxData = {
                    id: newTxId,
                    date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                    type: transactionType,
                    clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                    clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                    cryptoWalletId: accountId,
                    cryptoWalletName: cryptoWalletName,
                    amount: 0,
                    currency: 'USDT',
                    amount_usd: syncedAmount,
                    fee_usd: 0,
                    expense_usd: 0,
                    amount_usdt: syncedAmount,
                    hash: tx.hash,
                    status: 'Pending',
                    notes: note,
                    client_wallet_address: clientAddress,
                    createdAt: new Date().toISOString(),
                    flags: [],
                };
                updates[`/transactions/${newTxId}`] = stripUndefined(newTxData);
                totalNewTxCount++;
                existingHashes.add(tx.hash); // Prevent duplicate adds in the same run
            }
        }

        if (totalNewTxCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        revalidatePath('/modern-usdt-records');
        return { message: `${totalNewTxCount} new transaction(s) were successfully synced across all wallets.`, error: false };

    } catch (error: any) {
        console.error("BscScan Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}

export async function syncHistoricalBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return { message: "Historical sync needs to be re-evaluated for multi-API support. This feature is temporarily disabled.", error: true };
}
