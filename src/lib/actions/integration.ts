
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, update, query, orderByChild, equalTo, limitToLast } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, BscApiSetting, ModernUsdtRecord } from '../types';
import { stripUndefined, getNextSequentialId } from './helpers';
import { findClientByAddress } from './client';

export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

const SyncBscSchema = z.object({
  apiId: z.string().min(1, 'An API configuration must be selected.'),
});

export async function syncBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    const validatedFields = SyncBscSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { message: 'Invalid data submitted. An API configuration must be selected.', error: true };
    }
    const { apiId } = validatedFields.data;

    try {
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        if (!apiSettingSnapshot.exists()) {
            return { message: `API Configuration with ID "${apiId}" not found.`, error: true };
        }
        const setting: BscApiSetting = apiSettingSnapshot.val();
        const { apiKey, walletAddress, accountId, name: configName, lastSyncedBlock = 0 } = setting;
        if (!apiKey || !walletAddress) {
            return { message: `API config "${configName}" is missing an API key or wallet address.`, error: true };
        }
        
        let apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${walletAddress}&page=1&offset=1000&sort=asc&apikey=${apiKey}`;
        if (lastSyncedBlock > 0) {
            apiUrl += `&startblock=${lastSyncedBlock + 1}`;
        } else {
            // First time sync, get only the most recent transaction to start
            apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${walletAddress}&page=1&offset=1&sort=desc&apikey=${apiKey}`;
        }
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`BscScan API request failed: ${response.statusText}`);

        const data = await response.json();
        if (data.status !== "1") {
             if (data.message === "No transactions found" || (Array.isArray(data.result) && data.result.length === 0)) {
                return { message: `No new transactions found for ${configName}.`, error: false };
            }
            throw new Error(`BscScan API Error for ${configName}: ${data.message}`);
        }
        
        const fetchedTransactions: any[] = Array.isArray(data.result) ? data.result : [];

        if (fetchedTransactions.length === 0) {
            return { message: `No new transactions found for ${configName}.`, error: false };
        }

        // API sorts by 'asc', no need for client-side sort
        
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';
        
        const updates: { [key: string]: any } = {};
        let latestBlock = lastSyncedBlock;
        
        for (const tx of fetchedTransactions) {
            const txBlockNumber = parseInt(tx.blockNumber);
            if (txBlockNumber <= lastSyncedBlock && lastSyncedBlock > 0) continue; // Skip already processed blocks if any overlap

            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
            if (syncedAmount <= 0.01) continue;

            const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
            const clientWalletAddress = isIncoming ? tx.from : tx.to;
            
            const existingClient = await findClientByAddress(clientWalletAddress);

            const newRecordId = await getNextSequentialId('usdtRecordId');
            
            const newTxData: Omit<ModernUsdtRecord, 'id'> = {
                date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                type: isIncoming ? 'inflow' : 'outflow',
                source: 'BSCScan',
                status: 'Confirmed',
                clientId: existingClient ? existingClient.id : null,
                clientName: existingClient ? existingClient.name : 'Unassigned',
                accountId: accountId,
                accountName: cryptoWalletName,
                amount: syncedAmount,
                clientWalletAddress: clientWalletAddress,
                txHash: tx.hash,
                notes: `Synced from ${configName}`,
                createdAt: new Date().toISOString(),
                blockNumber: txBlockNumber
            };
            updates[`/modern_usdt_records/${newRecordId}`] = stripUndefined(newTxData);

            if (txBlockNumber > latestBlock) {
                latestBlock = txBlockNumber;
            }
        }

        if (Object.keys(updates).length > 0) {
            // Update the last synced block on the API setting itself
            updates[`/bsc_apis/${apiId}/lastSyncedBlock`] = latestBlock;
            await update(ref(db), updates);
        }

        revalidatePath('/modern-usdt-records');
        return { message: `${fetchedTransactions.length} new transaction(s) were successfully synced for ${configName}.`, error: false };

    } catch (error: any) {
        console.error("BscScan Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}
