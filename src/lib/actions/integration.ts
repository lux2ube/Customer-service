

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, remove, update, query, orderByChild, equalTo, limitToLast, push } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, BscApiSetting, UsdtRecord, JournalEntry, ModernUsdtRecord } from '../types';
import { stripUndefined, getNextSequentialId, notifyClientTransaction } from './helpers';
import { findClientByAddress } from './client';

export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;
const BSC_CHAIN_ID = 56;

const SyncBscSchema = z.object({
  apiId: z.string().min(1, 'An API configuration must be selected.'),
});

const SyncCsvSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required.'),
  configName: z.string().min(1, 'Configuration name is required.'),
  csvData: z.string().min(1, 'CSV data is required.'),
  walletAddress: z.string().min(1, 'Wallet address is required.'),
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

        // Etherscan V2 API - fetch 100 transactions per batch, sorted by asc, starting from lastSyncedBlock
        const startBlock = lastSyncedBlock > 0 ? lastSyncedBlock : 0;
        const apiUrl = `https://api.etherscan.io/v2/api?chainid=${BSC_CHAIN_ID}&module=account&action=tokentx&contractaddress=${USDT_CONTRACT_ADDRESS}&address=${walletAddress}&page=1&offset=100&startblock=${startBlock}&sort=asc&apikey=${apiKey}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Etherscan API request failed: ${response.statusText}`);

        const data = await response.json();
        if (data.status !== "1") {
             if (data.message === "No transactions found" || (Array.isArray(data.result) && data.result.length === 0)) {
                return { message: `No new transactions found for ${configName}.`, error: false };
            }
            throw new Error(`Etherscan API Error for ${configName}: ${data.message}`);
        }
        
        const fetchedTransactions: any[] = Array.isArray(data.result) ? data.result : [];

        if (fetchedTransactions.length === 0) {
            return { message: `No new transactions found for ${configName}.`, error: false };
        }
        
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists() ? (walletAccountSnapshot.val() as Account).name : 'Synced USDT Wallet';
        
        const updates: { [key: string]: any } = {};
        let highestBlock = lastSyncedBlock;
        let newRecordsCount = 0;
        let skippedCount = 0;

        for (const tx of fetchedTransactions) {
            const txBlockNumber = parseInt(tx.blockNumber);
            
            // Skip transactions from the exact lastSyncedBlock (already processed)
            if (txBlockNumber <= lastSyncedBlock && lastSyncedBlock > 0) {
                skippedCount++;
                continue;
            }

            highestBlock = Math.max(highestBlock, txBlockNumber);
            
            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
            if (syncedAmount <= 0.01) {
                skippedCount++;
                continue;
            }

            const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
            const clientWalletAddress = isIncoming ? tx.from : tx.to;
            
            const existingClient = await findClientByAddress(clientWalletAddress);

            // Generate USDT1, USDT2, etc. ID for modern_usdt_records collection
            const newRecordId = await getNextSequentialId('modernUsdtRecordId');
            
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
            };
            
            // Store in modern_usdt_records collection with USDT1, USDT2, etc. as document ID
            updates[`/modern_usdt_records/${newRecordId}`] = { id: newRecordId, ...stripUndefined(newTxData), blockNumber: txBlockNumber };

            if (existingClient) {
                const clientAccountId = `6000${existingClient.id}`;
                const journalDescription = `Synced USDT ${newTxData.type} from ${configName} for ${existingClient.name}`;
                const journalRef = push(ref(db, 'journal_entries'));
                
                const clientNameForJournal = existingClient.name || `Client ${existingClient.id}`;

                const journalEntry: Omit<JournalEntry, 'id'> = {
                    date: newTxData.date,
                    description: journalDescription,
                    debit_account: newTxData.type === 'inflow' ? accountId : clientAccountId,
                    credit_account: newTxData.type === 'inflow' ? clientAccountId : accountId,
                    debit_amount: newTxData.amount,
                    credit_amount: newTxData.amount,
                    amount_usd: newTxData.amount,
                    createdAt: new Date().toISOString(),
                    debit_account_name: newTxData.type === 'inflow' ? cryptoWalletName : clientNameForJournal,
                    credit_account_name: newTxData.type === 'inflow' ? clientNameForJournal : cryptoWalletName,
                };
                updates[`/journal_entries/${journalRef.key}`] = journalEntry;

                await notifyClientTransaction(existingClient.id, existingClient.name, { ...newTxData, currency: 'USDT', amountusd: newTxData.amount });
            }

            newRecordsCount++;
        }

        // Update lastSyncedBlock to the highest block number processed
        if (highestBlock > lastSyncedBlock) {
            updates[`/bsc_apis/${apiId}/lastSyncedBlock`] = highestBlock;
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/modern-usdt-records');
        
        // Build detailed summary message
        const summary = [
            `Sync completed for "${configName}".`,
            `${newRecordsCount} new transaction(s) synced.`,
            skippedCount > 0 ? `${skippedCount} transaction(s) skipped.` : null,
            highestBlock > 0 ? `Last synced block: ${highestBlock}` : null,
        ].filter(Boolean).join(' ');
        
        return { message: summary, error: false };

    } catch (error: any) {
        console.error("Etherscan BSC Sync Error:", error);
        return { message: error.message || "An unknown error occurred during sync.", error: true };
    }
}

export async function syncBscCsv(prevState: SyncState, formData: FormData): Promise<SyncState> {
    const csvFile = formData.get('csvFile') as File;
    const apiId = formData.get('apiId') as string;
    
    if (!csvFile || !apiId) {
        return { message: 'CSV file and API configuration are required.', error: true };
    }

    try {
        // Get API configuration
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        if (!apiSettingSnapshot.exists()) {
            return { message: `API Configuration with ID "${apiId}" not found.`, error: true };
        }
        const setting: BscApiSetting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName } = setting;
        
        if (!walletAddress || !accountId) {
            return { message: `API config "${configName}" is missing wallet address or linked account.`, error: true };
        }

        const csvText = await csvFile.text();
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            return { message: 'CSV file is empty or has no data rows.', error: true };
        }

        const headers = lines[0].split(',').map((h: string) => h.replace(/^"|"$/g, '').trim());
        const headerMap: { [key: string]: number } = {};
        headers.forEach((header: string, index: number) => {
            headerMap[header.toLowerCase()] = index;
        });

        const requiredHeaders = ['transaction hash', 'blockno', 'unixtimestamp', 'from', 'to', 'tokenvalue'];
        const missingHeaders = requiredHeaders.filter(h => !(h in Object.keys(headerMap).map(k => k.toLowerCase())));
        if (missingHeaders.length > 0) {
            return { message: `CSV is missing required columns: ${missingHeaders.join(', ')}`, error: true };
        }

        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        if (!walletAccountSnapshot.exists()) {
            return { message: `Account with ID "${accountId}" not found.`, error: true };
        }
        const cryptoWalletName = (walletAccountSnapshot.val() as Account).name || 'Synced USDT Wallet';

        const updates: { [key: string]: any } = {};
        let newRecordsCount = 0;
        let skippedCount = 0;
        const processedHashes = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.match(/"([^"]*)"|([^,]+)/g)?.map((v: string) => v.replace(/^"|"$/g, '').trim()) || [];
            if (values.length < requiredHeaders.length) continue;

            const hash = values[headerMap['transaction hash']] || '';
            const blockNumber = values[headerMap['blockno']] || '0';
            const timeStamp = values[headerMap['unixtimestamp']] || '0';
            const from = values[headerMap['from']]?.toLowerCase() || '';
            const to = values[headerMap['to']]?.toLowerCase() || '';
            let tokenValue = values[headerMap['tokenvalue']]?.replace(/,/g, '') || '0';

            if (processedHashes.has(hash)) {
                skippedCount++;
                continue;
            }
            processedHashes.add(hash);

            if (!hash || !from || !to) {
                skippedCount++;
                continue;
            }

            const syncedAmount = parseFloat(tokenValue.replace(/,/g, ''));
            if (syncedAmount <= 0.01) {
                skippedCount++;
                continue;
            }

            const isIncoming = to === walletAddress;
            const clientWalletAddress = isIncoming ? from : to;

            const existingClient = await findClientByAddress(clientWalletAddress);

            const newRecordId = await getNextSequentialId('modernUsdtRecordId');

            const newTxData: Omit<ModernUsdtRecord, 'id'> = {
                date: new Date(parseInt(timeStamp) * 1000).toISOString(),
                type: isIncoming ? 'inflow' : 'outflow',
                source: 'CSV',
                status: 'Confirmed',
                clientId: existingClient ? existingClient.id : null,
                clientName: existingClient ? existingClient.name : 'Unassigned',
                accountId: accountId,
                accountName: cryptoWalletName,
                amount: syncedAmount,
                clientWalletAddress: clientWalletAddress,
                txHash: hash,
                notes: `Synced from CSV: ${configName}`,
                createdAt: new Date().toISOString(),
            };

            updates[`/modern_usdt_records/${newRecordId}`] = { id: newRecordId, ...stripUndefined(newTxData), blockNumber: parseInt(blockNumber) };

            if (existingClient) {
                const clientAccountId = `6000${existingClient.id}`;
                const journalDescription = `Synced USDT ${newTxData.type} from CSV: ${configName} for ${existingClient.name}`;
                const journalRef = push(ref(db, 'journal_entries'));

                const journalEntry: Omit<JournalEntry, 'id'> = {
                    date: newTxData.date,
                    description: journalDescription,
                    debit_account: newTxData.type === 'inflow' ? accountId : clientAccountId,
                    credit_account: newTxData.type === 'inflow' ? clientAccountId : accountId,
                    debit_amount: newTxData.amount,
                    credit_amount: newTxData.amount,
                    amount_usd: newTxData.amount,
                    createdAt: new Date().toISOString(),
                };
                updates[`/journal_entries/${journalRef.key}`] = journalEntry;
                await notifyClientTransaction(existingClient.id, existingClient.name, { ...newTxData, currency: 'USDT', amountusd: newTxData.amount });
            }

            newRecordsCount++;
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/modern-usdt-records');

        const summary = [
            `CSV sync completed for "${configName}".`,
            `${newRecordsCount} new transaction(s) synced.`,
            skippedCount > 0 ? `${skippedCount} transaction(s) skipped.` : null,
        ].filter(Boolean).join(' ');

        return { message: summary, error: false };

    } catch (error: any) {
        console.error("CSV Sync Error:", error);
        return { message: error.message || "An error occurred during CSV sync.", error: true };
    }
}
