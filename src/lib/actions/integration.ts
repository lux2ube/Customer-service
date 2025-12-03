

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, remove, update, query, orderByChild, equalTo, limitToLast, push } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';
import type { Client, Account, Settings, Transaction, BscApiSetting, UsdtRecord, JournalEntry, ModernUsdtRecord } from '../types';
import { stripUndefined, getNextSequentialId, notifyClientTransaction, BalanceTracker } from './helpers';
import { findClientByAddress } from './client';

export type SyncState = { message?: string; error?: boolean; } | undefined;

const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_DECIMALS = 18;
const BSC_CHAIN_ID = 56;

const SyncBscSchema = z.object({
  apiId: z.string().min(1, 'An API configuration must be selected.'),
  startDate: z.string().optional(),
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
    const { apiId, startDate } = validatedFields.data;

    try {
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        if (!apiSettingSnapshot.exists()) {
            return { message: `API Configuration with ID "${apiId}" not found.`, error: true };
        }
        const setting: BscApiSetting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName, lastSyncedBlock = 0 } = setting;
        
        if (!walletAddress) {
            return { message: `API config "${configName}" is missing a wallet address.`, error: true };
        }

        // Use Ankr as the official BSC RPC provider (from environment variable)
        const ANKR_RPC_URL = process.env.ANKR_BSC_RPC_URL;
        if (!ANKR_RPC_URL) {
            return { message: 'Ankr RPC URL not configured. Please set ANKR_BSC_RPC_URL environment variable.', error: true };
        }
        
        let fetchedTransactions: any[] = [];
        let provider: ethers.JsonRpcProvider | null = null;
        
        try {
            provider = new ethers.JsonRpcProvider(ANKR_RPC_URL);
            await provider.getBlockNumber();
            console.log(`✓ Connected to Ankr BSC RPC`);
        } catch (e: any) {
            console.log(`✗ Failed to connect to Ankr: ${e.message}`);
            return { message: `Failed to connect to Ankr RPC: ${e.message}`, error: true };
        }
        
        try {
            // Get current block number
            let currentBlock: number;
            try {
                currentBlock = await provider.getBlockNumber();
            } catch (e: any) {
                return { message: `Failed to get current block number: ${e.message}`, error: true };
            }
            
            // Calculate start block based on lastSyncedBlock or today's start
            let queryStartBlock: number;
            
            if (startDate) {
                // If startDate provided, calculate block from date (BSC ~3 seconds per block)
                const startTimestamp = new Date(startDate).getTime() / 1000;
                const currentTimestamp = Math.floor(Date.now() / 1000);
                
                if (startTimestamp > currentTimestamp) {
                    return { message: `Start date cannot be in the future. Please select a past date.`, error: true };
                }
                
                const secondsDiff = currentTimestamp - startTimestamp;
                const blocksDiff = Math.floor(secondsDiff / 3);
                queryStartBlock = Math.max(0, currentBlock - blocksDiff);
                console.log(`📅 Syncing from date ${startDate}: starting at block ${queryStartBlock}`);
            } else if (lastSyncedBlock > 0) {
                // Continue from last synced block
                queryStartBlock = lastSyncedBlock + 1;
                console.log(`📦 Continuing from last synced block: ${lastSyncedBlock}`);
            } else {
                // First sync: start from today's beginning
                const todayStart = new Date();
                todayStart.setHours(0, 0, 0, 0);
                const todayStartTimestamp = Math.floor(todayStart.getTime() / 1000);
                const currentTimestamp = Math.floor(Date.now() / 1000);
                const secondsSinceMidnight = currentTimestamp - todayStartTimestamp;
                const blocksSinceMidnight = Math.floor(secondsSinceMidnight / 3);
                queryStartBlock = currentBlock - blocksSinceMidnight;
                console.log(`🌅 First sync: starting from today's beginning at block ${queryStartBlock}`);
            }
            
            console.log(`🔍 BSC Sync for wallet ${walletAddress}`);
            console.log(`   Current block: ${currentBlock}, querying blocks ${queryStartBlock}-${currentBlock} (${currentBlock - queryStartBlock} blocks)`);
            
            // USDT contract interface to get Transfer events
            const USDT_ABI = [
                'event Transfer(address indexed from, address indexed to, uint256 value)',
            ];
            const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, provider);
            
            // Filter transfers to/from the wallet address
            const toFilter = usdtContract.filters.Transfer(null, walletAddress);
            const fromFilter = usdtContract.filters.Transfer(walletAddress, null);
            
            // Ankr supports larger batches than free RPCs (500 blocks per query)
            const BATCH_SIZE = 500;
            const toEvents: any[] = [];
            const fromEvents: any[] = [];
            const totalBatches = Math.ceil((currentBlock - queryStartBlock) / BATCH_SIZE);
            let batchNum = 0;
            
            for (let blockStart = queryStartBlock; blockStart < currentBlock; blockStart += BATCH_SIZE) {
                batchNum++;
                const blockEnd = Math.min(blockStart + BATCH_SIZE, currentBlock);
                
                try {
                    console.log(`   [${batchNum}/${totalBatches}] Querying blocks ${blockStart}-${blockEnd}...`);
                    
                    // Query in parallel for speed (Ankr handles this well)
                    const [batchTo, batchFrom] = await Promise.all([
                        usdtContract.queryFilter(toFilter, blockStart, blockEnd),
                        usdtContract.queryFilter(fromFilter, blockStart, blockEnd),
                    ]);
                    
                    toEvents.push(...batchTo);
                    fromEvents.push(...batchFrom);
                    
                    if (batchTo.length > 0 || batchFrom.length > 0) {
                        console.log(`      Found ${batchTo.length} in, ${batchFrom.length} out`);
                    }
                    
                    // Small delay between batches
                    await new Promise(resolve => setTimeout(resolve, 50));
                } catch (e: any) {
                    console.log(`   ⚠️ Batch ${blockStart}-${blockEnd} failed: ${e.message}, retrying with smaller range...`);
                    
                    // Retry with smaller batches if Ankr rejects
                    const midBlock = Math.floor((blockStart + blockEnd) / 2);
                    try {
                        const [batchTo1, batchFrom1] = await Promise.all([
                            usdtContract.queryFilter(toFilter, blockStart, midBlock),
                            usdtContract.queryFilter(fromFilter, blockStart, midBlock),
                        ]);
                        toEvents.push(...batchTo1);
                        fromEvents.push(...batchFrom1);
                        
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        const [batchTo2, batchFrom2] = await Promise.all([
                            usdtContract.queryFilter(toFilter, midBlock, blockEnd),
                            usdtContract.queryFilter(fromFilter, midBlock, blockEnd),
                        ]);
                        toEvents.push(...batchTo2);
                        fromEvents.push(...batchFrom2);
                    } catch (retryError: any) {
                        console.log(`   ❌ Retry also failed: ${retryError.message}`);
                        throw new Error(`Batch query failed after retry: ${retryError.message}`);
                    }
                }
            }
            
            console.log(`✓ Found ${toEvents.length} incoming + ${fromEvents.length} outgoing USDT events`);
            if (toEvents.length === 0 && fromEvents.length === 0) {
                console.log(`   → No new USDT transactions since block ${queryStartBlock}.`);
            }
            
            // Combine and sort events
            const allEvents = [...toEvents, ...fromEvents].sort((a, b) => {
                if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
                return (a.transactionIndex || 0) - (b.transactionIndex || 0);
            });
            
            // Convert events to transaction objects
            fetchedTransactions = await Promise.all(allEvents.map(async (event) => {
                const block = await provider!.getBlock(event.blockNumber);
                
                const from = event.args?.from || '';
                const to = event.args?.to || '';
                const value = event.args?.value?.toString() || '0';
                
                return {
                    hash: event.transactionHash,
                    blockNumber: event.blockNumber.toString(),
                    timeStamp: Math.floor((block?.timestamp || Date.now() / 1000)).toString(),
                    from: from,
                    to: to,
                    value: value,
                    transactionIndex: event.transactionIndex?.toString() || '0',
                };
            }));
        } catch (error: any) {
            console.error("❌ Ankr BSC RPC Error:", error);
            throw new Error(`Failed to fetch from Ankr: ${error.message}`);
        }

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
        
        // Pre-process transactions to collect all account IDs for balance tracking
        const transactionsToProcess: Array<{
            tx: any;
            existingClient: Client | null;
            syncedAmount: number;
            isIncoming: boolean;
            clientWalletAddress: string;
        }> = [];
        
        const accountIdsForBalances = new Set<string>([accountId, '7002']);
        
        for (const tx of fetchedTransactions) {
            const txBlockNumber = parseInt(tx.blockNumber);
            if (txBlockNumber <= lastSyncedBlock && lastSyncedBlock > 0) {
                skippedCount++;
                continue;
            }
            
            const syncedAmount = parseFloat(tx.value) / (10 ** USDT_DECIMALS);
            if (syncedAmount <= 0.01) {
                skippedCount++;
                continue;
            }
            
            const isIncoming = tx.to.toLowerCase() === walletAddress.toLowerCase();
            const clientWalletAddress = isIncoming ? tx.from : tx.to;
            const existingClient = await findClientByAddress(clientWalletAddress);
            
            if (existingClient) {
                accountIdsForBalances.add(`6000${existingClient.id}`);
            }
            
            transactionsToProcess.push({ tx, existingClient, syncedAmount, isIncoming, clientWalletAddress });
        }
        
        // Initialize balance tracker with all accounts that will be affected
        const balanceTracker = new BalanceTracker(new Date().toISOString());
        await balanceTracker.loadAccounts([...accountIdsForBalances]);
        
        // Validate critical accounts exist
        const missingAccounts = balanceTracker.getMissingAccounts();
        if (missingAccounts.includes(accountId)) {
            return { message: `Cannot sync: Wallet account ${accountId} is missing. Please create this account first.`, error: true };
        }
        if (missingAccounts.includes('7002')) {
            return { message: `Cannot sync: Account 7002 (Unmatched USDT) is missing. Please create this account first.`, error: true };
        }
        // Filter out transactions for clients with missing accounts
        const validTransactions = transactionsToProcess.filter(({ existingClient }) => {
            if (existingClient) {
                const clientAccountId = `6000${existingClient.id}`;
                if (missingAccounts.includes(clientAccountId)) {
                    console.warn(`⚠️ USDT Sync: Client ${existingClient.name} missing account ${clientAccountId}, will sync as unassigned`);
                    return false;
                }
            }
            return true;
        });
        
        // Re-add clients with missing accounts as unassigned
        const transactionsWithFixedClients = validTransactions.map(tx => ({
            ...tx,
            existingClient: tx.existingClient && !missingAccounts.includes(`6000${tx.existingClient.id}`) 
                ? tx.existingClient 
                : null
        }));

        for (const { tx, existingClient, syncedAmount, isIncoming, clientWalletAddress } of transactionsWithFixedClients) {
            const txBlockNumber = parseInt(tx.blockNumber);
            highestBlock = Math.max(highestBlock, txBlockNumber);

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
            
            updates[`/modern_usdt_records/${newRecordId}`] = { id: newRecordId, ...stripUndefined(newTxData), blockNumber: txBlockNumber };

            const journalRef = push(ref(db, 'journal_entries'));
            
            if (existingClient) {
                const clientAccountId = `6000${existingClient.id}`;
                const journalDescription = `Synced USDT ${newTxData.type} from ${configName} for ${existingClient.name}`;
                const clientNameForJournal = existingClient.name || `Client ${existingClient.id}`;

                // INFLOW (receipt from client): Debit client (liability UP), Credit wallet (asset UP via credit reversal)
                // OUTFLOW (payment to client): Credit client (liability DOWN), Debit wallet (asset DOWN via debit)
                // Convention: stored_balance = debits - credits. For client liabilities displayed as positive:
                //   - Debit increases displayed balance (we owe them more)
                //   - Credit decreases displayed balance (we owe them less)
                const debitAcc = newTxData.type === 'inflow' ? clientAccountId : accountId;
                const creditAcc = newTxData.type === 'inflow' ? accountId : clientAccountId;

                const journalEntry: Omit<JournalEntry, 'id'> = {
                    date: newTxData.date,
                    description: journalDescription,
                    debit_account: debitAcc,
                    credit_account: creditAcc,
                    debit_amount: newTxData.amount,
                    credit_amount: newTxData.amount,
                    amount_usd: newTxData.amount,
                    createdAt: new Date().toISOString(),
                    debit_account_name: newTxData.type === 'inflow' ? clientNameForJournal : cryptoWalletName,
                    credit_account_name: newTxData.type === 'inflow' ? cryptoWalletName : clientNameForJournal,
                };
                updates[`/journal_entries/${journalRef.key}`] = journalEntry;
                
                // Track balance changes (accumulates correctly for multiple entries)
                balanceTracker.addJournalEntry(debitAcc, creditAcc, newTxData.amount);

                await notifyClientTransaction(existingClient.id, existingClient.name, { ...newTxData, currency: 'USDT', amountusd: newTxData.amount });
            } else {
                const unassignedUsdtAccountId = '7002';
                const journalDescription = `Unassigned USDT ${newTxData.type} from ${configName} - wallet: ${clientWalletAddress.slice(0, 10)}...`;

                // Same logic for unassigned USDT liability (7002)
                const debitAcc = newTxData.type === 'inflow' ? unassignedUsdtAccountId : accountId;
                const creditAcc = newTxData.type === 'inflow' ? accountId : unassignedUsdtAccountId;

                const journalEntry: Omit<JournalEntry, 'id'> = {
                    date: newTxData.date,
                    description: journalDescription,
                    debit_account: debitAcc,
                    credit_account: creditAcc,
                    debit_amount: newTxData.amount,
                    credit_amount: newTxData.amount,
                    amount_usd: newTxData.amount,
                    createdAt: new Date().toISOString(),
                    debit_account_name: newTxData.type === 'inflow' ? 'Unassigned USDT Liability' : cryptoWalletName,
                    credit_account_name: newTxData.type === 'inflow' ? cryptoWalletName : 'Unassigned USDT Liability',
                };
                updates[`/journal_entries/${journalRef.key}`] = journalEntry;
                
                // Track balance changes (accumulates correctly for multiple entries)
                balanceTracker.addJournalEntry(debitAcc, creditAcc, newTxData.amount);
            }

            newRecordsCount++;
        }

        // Get all accumulated balance updates
        const balanceUpdates = balanceTracker.getBalanceUpdates();
        Object.assign(updates, balanceUpdates);

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
        const missingHeaders = requiredHeaders.filter(h => !Object.keys(headerMap).includes(h));
        if (missingHeaders.length > 0) {
            return { message: `CSV is missing required columns: ${missingHeaders.join(', ')}`, error: true };
        }

        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        if (!walletAccountSnapshot.exists()) {
            return { message: `Account with ID "${accountId}" not found.`, error: true };
        }
        const cryptoWalletName = (walletAccountSnapshot.val() as Account).name || 'Synced USDT Wallet';

        const BATCH_SIZE = 100; // Process 100 rows per batch to avoid timeout
        let newRecordsCount = 0;
        let skippedCount = 0;
        const processedHashes = new Set<string>();

        // Process rows in batches
        for (let startIdx = 1; startIdx < lines.length; startIdx += BATCH_SIZE) {
            const endIdx = Math.min(startIdx + BATCH_SIZE, lines.length);
            const batchUpdates: { [key: string]: any } = {};
            
            for (let i = startIdx; i < endIdx; i++) {
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
                    status: 'Confirmed', // All records confirmed by default
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

                batchUpdates[`/modern_usdt_records/${newRecordId}`] = { id: newRecordId, ...stripUndefined(newTxData), blockNumber: parseInt(blockNumber) };

                if (existingClient) {
                    const clientAccountId = `6000${existingClient.id}`;
                    const journalDescription = `Synced USDT ${newTxData.type} from CSV: ${configName} for ${existingClient.name}`;
                    const journalRef = push(ref(db, 'journal_entries'));

                    // Same logic: Inflow (receipt) debits client (liability UP), outflow (payment) credits client (liability DOWN)
                    const journalEntry: Omit<JournalEntry, 'id'> = {
                        date: newTxData.date,
                        description: journalDescription,
                        debit_account: newTxData.type === 'inflow' ? clientAccountId : accountId,
                        credit_account: newTxData.type === 'inflow' ? accountId : clientAccountId,
                        debit_amount: newTxData.amount,
                        credit_amount: newTxData.amount,
                        amount_usd: newTxData.amount,
                        createdAt: new Date().toISOString(),
                    };
                    batchUpdates[`/journal_entries/${journalRef.key}`] = journalEntry;
                    await notifyClientTransaction(existingClient.id, existingClient.name, { ...newTxData, currency: 'USDT', amountusd: newTxData.amount });
                }

                newRecordsCount++;
            }

            // Write batch to database
            if (Object.keys(batchUpdates).length > 0) {
                await update(ref(db), batchUpdates);
            }
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
