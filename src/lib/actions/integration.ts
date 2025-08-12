

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, remove, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, BscApiSetting, ModernUsdtRecord } from '../types';
import { stripUndefined, getNextSequentialId } from './helpers';

export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;

const SyncBscSchema = z.object({
  apiId: z.string().optional(),
});

export async function syncBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    const validatedFields = SyncBscSchema.safeParse(Object.fromEntries(formData.entries()));
    if (!validatedFields.success) {
        return { message: 'Invalid data submitted.', error: true };
    }
    const { apiId } = validatedFields.data;

    try {
        const apiSettingsToSync: BscApiSetting[] = [];
        if (apiId) {
            const settingSnapshot = await get(ref(db, `bsc_apis/${apiId}`));
            if (settingSnapshot.exists()) {
                apiSettingsToSync.push({ id: apiId, ...settingSnapshot.val() });
            } else {
                 return { message: `API Configuration with ID "${apiId}" not found.`, error: true };
            }
        } else {
             const allSettingsSnapshot = await get(ref(db, 'bsc_apis'));
            if (allSettingsSnapshot.exists()) {
                const allSettingsData: Record<string, BscApiSetting> = allSettingsSnapshot.val();
                apiSettingsToSync.push(...Object.keys(allSettingsData).map(key => ({ id: key, ...allSettingsData[key] })));
            }
        }

        if (apiSettingsToSync.length === 0) {
            return { message: 'No BSC API configurations found. Please add one in Settings.', error: true };
        }

        let totalNewTxCount = 0;
        
        const recordsSnapshot = await get(ref(db, 'modern_usdt_records'));
        const existingRecords = recordsSnapshot.val() || {};
        const existingHashes = new Set(Object.values(existingRecords).map((tx: any) => tx.txHash));

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

        for (const setting of apiSettingsToSync) {
            const { apiKey, walletAddress, accountId, name: configName } = setting;
            if (!apiKey || !walletAddress) {
                console.warn(`Skipping API config "${configName}" due to missing key or address.`);
                continue;
            }

            // Fetch the most recent transactions first to avoid pulling the whole history
            const apiUrl = `https://api.bscscan.com/api?module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${walletAddress}&page=1&offset=1000&sort=desc&apikey=${apiKey}`;
            
            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error(`BscScan API request failed for ${configName}: ${response.statusText}`);
                continue;
            }
            const data = await response.json();
            
            if (data.status !== "1") {
                console.warn(`BscScan API Error for ${configName}: ${data.message}`);
                continue;
            }

            const walletAccountRef = ref(db, `accounts/${accountId}`);
            const walletAccountSnapshot = await get(walletAccountRef);
            const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';
            
            const fetchedTransactions: any[] = data.result || [];
            
            // Filter out transactions we've already synced
            const newTransactions = fetchedTransactions.filter(tx => !existingHashes.has(tx.hash));

            // Reverse the array of NEW transactions to process the oldest ones first
            newTransactions.reverse();

            for (const tx of newTransactions) {
                const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
                if (syncedAmount <= 0.01) continue;

                const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
                const transactionType: ModernUsdtRecord['type'] = isIncoming ? 'inflow' : 'outflow';
                const clientAddress = isIncoming ? tx.from : tx.to;
                const foundClient = addressToClientMap[clientAddress.toLowerCase()];

                const newRecordId = await getNextSequentialId('usdtRecordId');
                
                const newTxData: Omit<ModernUsdtRecord, 'id'> = {
                    date: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
                    type: transactionType,
                    source: 'BSCScan',
                    status: 'Confirmed', // Automatically confirmed as it's from the blockchain
                    clientId: foundClient ? foundClient.id : null,
                    clientName: foundClient ? foundClient.name : 'Unassigned',
                    accountId: accountId,
                    accountName: cryptoWalletName,
                    amount: syncedAmount,
                    clientWalletAddress: clientAddress,
                    txHash: tx.hash,
                    notes: `Synced from ${configName}`,
                    createdAt: new Date().toISOString(),
                };
                updates[`/modern_usdt_records/${newRecordId}`] = stripUndefined(newTxData);
                totalNewTxCount++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/transactions');
        revalidatePath('/modern-usdt-records');
        return { message: `${totalNewTxCount} new transaction(s) were successfully synced.`, error: false };

    } catch (error: any) {
        console.error("BscScan Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}


export async function syncHistoricalBscTransactions(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return { message: "Historical sync needs to be re-evaluated for multi-API support. This feature is temporarily disabled.", error: true };
}
