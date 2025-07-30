
'use server';

import { db } from '../firebase';
import { push, ref, update, get } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction } from '../types';
import { stripUndefined } from './helpers';

export type SyncState = { message?: string; error?: boolean; } | undefined;
export type AutoProcessState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

export async function syncBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    try {
        const settingsSnapshot = await get(ref(db, 'settings'));
        if (!settingsSnapshot.exists()) {
            return { message: 'Settings not found. Please configure API key and wallet address.', error: true };
        }
        const settings: Settings = settingsSnapshot.val();
        const { bsc_api_key, bsc_wallet_address } = settings;

        if (!bsc_api_key || !bsc_wallet_address) {
            return { message: 'BscScan API Key or Wallet Address is not set in Settings.', error: true };
        }
        
        const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${bsc_wallet_address}&page=1&offset=200&sort=desc&apikey=${bsc_api_key}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            return { message: `BscScan API request failed: ${response.statusText}`, error: true };
        }
        const data = await response.json();
        
        if (data.status !== "1") {
            // Provide more informative error message for known API responses
            if (data.message === "No transactions found") {
                return { message: "No new transactions found on BscScan.", error: false };
            }
             if (data.message === "Query Timeout" || (data.result && data.result.includes("Max rate limit reached"))) {
                return { message: "BscScan API rate limit reached. Please wait a moment and try again.", error: true };
            }
            return { message: `BscScan API Error: ${data.message}`, error: true };
        }

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

        let newTxCount = 0;
        const updates: { [key: string]: any } = {};

        const walletAccountRef = ref(db, 'accounts/1003');
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';


        for (const tx of data.result) {
            if (existingHashes.has(tx.hash)) {
                continue;
            }

            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);

            if (syncedAmount <= 0.01) {
                continue;
            }

            const isIncoming = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase();
            const transactionType = isIncoming ? 'Withdraw' : 'Deposit';
            const clientAddress = isIncoming ? tx.from : tx.to;
            const foundClient = addressToClientMap[clientAddress.toLowerCase()];

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = `Synced from BscScan. From: ${tx.from}. To: ${tx.to}`;

            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
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
            newTxCount++;
        }

        if (newTxCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        return { message: `${newTxCount} new transaction(s) were successfully synced.`, error: false };

    } catch (error: any) {
        console.error("BscScan Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}

export async function syncHistoricalBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    try {
        const settingsSnapshot = await get(ref(db, 'settings'));
        if (!settingsSnapshot.exists()) {
            return { message: 'Settings not found. Please configure API key and wallet address.', error: true };
        }
        const settings: Settings = settingsSnapshot.val();
        const { bsc_api_key, bsc_wallet_address } = settings;

        if (!bsc_api_key || !bsc_wallet_address) {
            return { message: 'BscScan API Key or Wallet Address is not set in Settings.', error: true };
        }

        const transactionsSnapshot = await get(ref(db, 'transactions'));
        const existingHashes = new Set(Object.values(transactionsSnapshot.val() || {}).map((tx: any) => tx.hash));
        
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
        
        const walletAccountRef = ref(db, 'accounts/1003');
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';

        const cutoffDate = new Date('2025-05-25T00:00:00Z');
        const cutoffTimestamp = Math.floor(cutoffDate.getTime() / 1000);
        
        // Get the block number for the cutoff date
        const blockApiUrl = `https://api.bscscan.com/api?module=block&action=getblocknobytime&timestamp=${cutoffTimestamp}&closest=before&apikey=${bsc_api_key}`;
        const blockResponse = await fetch(blockApiUrl);
        const blockData = await blockResponse.json();
        if (blockData.status !== "1") {
            return { message: `BscScan API Error (getblocknobytime): ${blockData.message}`, error: true };
        }
        const endBlock = blockData.result;

        let page = 1;
        let allNewTransactions: any[] = [];
        let keepFetching = true;

        while (keepFetching) {
            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${bsc_wallet_address}&page=${page}&offset=1000&endblock=${endBlock}&sort=desc&apikey=${bsc_api_key}`;
            const response = await fetch(apiUrl);
            if (!response.ok) throw new Error(`BscScan API request failed: ${response.statusText}`);
            
            const data = await response.json();
            if (data.status !== "1") {
                if (data.message === "No transactions found") break; // Normal end of transactions
                if (data.message === "Query Timeout" || (data.result && data.result.includes("Max rate limit reached"))) {
                   return { message: "BscScan API rate limit reached. Please wait a moment and try again.", error: true };
                }
                 if (data.result?.includes('transactions should be less than 10000')) {
                    return { message: "API Error: Too many transactions in range. The historical sync needs to be broken into smaller time periods.", error: true };
                }
                throw new Error(`BscScan API Error: ${data.message}`);
            }

            const results = data.result || [];
            if (results.length === 0) {
                keepFetching = false;
                break;
            }

            for (const tx of results) {
                if (!existingHashes.has(tx.hash)) {
                    allNewTransactions.push(tx);
                }
            }

            if (results.length < 1000) {
                 keepFetching = false;
            }

            page++;
            if (page > 10) { // Safety break after 10 pages (10,000 transactions)
                keepFetching = false;
                console.warn("Historical sync stopped after 10 pages to avoid API limits.");
            }
            await new Promise(resolve => setTimeout(resolve, 250)); // Rate limit
        }

        const updates: { [key: string]: any } = {};

        for (const tx of allNewTransactions) {
            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
            if (syncedAmount <= 0.01) continue;

            const isIncoming = tx.to.toLowerCase() === bsc_wallet_address.toLowerCase();
            const transactionType = isIncoming ? 'Withdraw' : 'Deposit';
            const clientAddress = isIncoming ? tx.from : tx.to;
            const foundClient = addressToClientMap[clientAddress.toLowerCase()];

            const newTxId = push(ref(db, 'transactions')).key;
            if (!newTxId) continue;
            
            const note = `Synced from BscScan. From: ${tx.from}. To: ${tx.to}`;
            const newTxData = {
                id: newTxId,
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: transactionType,
                clientId: foundClient ? foundClient.id : 'unassigned-bscscan',
                clientName: foundClient ? foundClient.name : 'Unassigned (BSCScan)',
                cryptoWalletId: '1003',
                cryptoWalletName: cryptoWalletName,
                amount: 0, currency: 'USDT',
                amount_usd: syncedAmount, fee_usd: 0, expense_usd: 0, amount_usdt: syncedAmount,
                hash: tx.hash, status: 'Pending', notes: note,
                client_wallet_address: clientAddress,
                createdAt: new Date().toISOString(), flags: [],
            };
            updates[`/transactions/${newTxId}`] = stripUndefined(newTxData);
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        return { message: `Historical Sync Complete: ${allNewTransactions.length} new transaction(s) were successfully synced.`, error: false };
    } catch (error: any) {
        console.error("BscScan Historical Sync Error:", error);
        return { message: error.message || "An unknown error occurred during historical sync.", error: true };
    }
}
