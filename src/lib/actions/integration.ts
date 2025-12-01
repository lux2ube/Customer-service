

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { ref, set, get, remove, update, query, orderByChild, equalTo, limitToLast, push } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';
import type { Client, Account, Settings, Transaction, BscApiSetting, UsdtRecord, JournalEntry, ModernUsdtRecord } from '../types';
import { stripUndefined, getNextSequentialId, notifyClientTransaction } from './helpers';
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
        const { apiKey, walletAddress, accountId, name: configName, lastSyncedBlock = 0 } = setting;
        
        if (!apiKey || !walletAddress) {
            return { message: `API config "${configName}" is missing an API key or wallet address.`, error: true };
        }

        // Use free BSC RPC providers with fallback support
        let fetchedTransactions: any[] = [];
        
        // Try multiple free RPC providers in order of preference
        const rpcProviders = [
            'https://rpc.ankr.com/bsc',                // Ankr - MORE permissive with queries
            'https://bsc-rpc.publicnode.com',          // PublicNode - good uptime
            'https://bsc-dataseed1.bnbchain.org:443',  // Official BNB Chain
            'https://bsc-dataseed2.bnbchain.org:443',  // Official BNB Chain backup
            'https://bsc.publicnode.com',              // PublicNode fallback
        ];
        
        let provider: ethers.JsonRpcProvider | null = null;
        let lastError: any = null;
        
        for (const rpcUrl of rpcProviders) {
            try {
                provider = new ethers.JsonRpcProvider(rpcUrl);
                // Test connection with a simple call
                await provider.getBlockNumber();
                console.log(`✓ Connected to RPC: ${rpcUrl}`);
                break;
            } catch (e: any) {
                console.log(`✗ Failed to connect to ${rpcUrl}: ${e.message}`);
                lastError = e;
                provider = null;
                continue;
            }
        }
        
        if (!provider) {
            return { 
                message: `Failed to connect to any BSC RPC provider. Last error: ${lastError?.message || 'Unknown error'}`, 
                error: true 
            };
        }
        
        try {
            
            // Get current block number
            let currentBlock: number;
            try {
                currentBlock = await provider.getBlockNumber();
            } catch (e: any) {
                return { 
                    message: `Failed to get current block number: ${e.message}`, 
                    error: true 
                };
            }
            
            // Free RPC limitation: only query recent blocks (last ~1000 blocks = ~60 minutes)
            const MAX_LOOKBACK = 1000;
            
            // Calculate start block
            let queryStartBlock = lastSyncedBlock > 0 ? lastSyncedBlock : (currentBlock - MAX_LOOKBACK);
            
            // If startDate provided, calculate block from date (BSC ~3 seconds per block)
            if (startDate) {
                const startTimestamp = new Date(startDate).getTime() / 1000;
                const currentTimestamp = Math.floor(Date.now() / 1000);
                
                // Check if date is in the future
                if (startTimestamp > currentTimestamp) {
                    return { message: `Start date cannot be in the future. Please select a past date.`, error: true };
                }
                
                const secondsDiff = currentTimestamp - startTimestamp;
                const blocksDiff = Math.floor(secondsDiff / 3);
                const calculatedBlock = Math.max(0, currentBlock - blocksDiff);
                
                // If calculated block is too old for free RPC, warn user
                if (calculatedBlock < currentBlock - MAX_LOOKBACK) {
                    console.log(`⚠️ Date ${startDate} is too far in the past. Free RPC can only query last ${MAX_LOOKBACK} blocks (~60 minutes).`);
                    console.log(`   Using most recent ${MAX_LOOKBACK} blocks instead.`);
                }
                
                queryStartBlock = Math.max(calculatedBlock, currentBlock - MAX_LOOKBACK);
                console.log(`📅 Syncing from date ${startDate}: calculated as block ${calculatedBlock}, adjusted to ${queryStartBlock}`);
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
            
            // Fetch events in VERY small batches with long delays to avoid rate limits
            // Official RPC is aggressive with rate limiting, so be very conservative
            const BATCH_SIZE = 50; // Query just 50 blocks at a time
            const toEvents: any[] = [];
            const fromEvents: any[] = [];
            
            // Query in smaller batches with long delays, and SEQUENTIALLY (not parallel)
            for (let blockStart = queryStartBlock; blockStart < currentBlock; blockStart += BATCH_SIZE) {
                const blockEnd = Math.min(blockStart + BATCH_SIZE, currentBlock);
                
                try {
                    console.log(`   Querying blocks ${blockStart}-${blockEnd}...`);
                    
                    // Query sequentially (one at a time) not in parallel to reduce server load
                    const batch1 = await usdtContract.queryFilter(toFilter, blockStart, blockEnd);
                    
                    // Long delay between queries
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    const batch2 = await usdtContract.queryFilter(fromFilter, blockStart, blockEnd);
                    
                    toEvents.push(...batch1);
                    fromEvents.push(...batch2);
                    
                    // Long delay between batches
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e: any) {
                    console.log(`   ⚠️ Batch ${blockStart}-${blockEnd} failed: ${e.message}`);
                    // Try fallback RPC by returning error
                    throw new Error(`Batch query failed: ${e.message}`);
                }
            }
            
            console.log(`✓ Found ${toEvents.length} incoming + ${fromEvents.length} outgoing USDT events`);
            if (toEvents.length === 0 && fromEvents.length === 0) {
                console.log(`   → Wallet has no recent USDT transactions. Send a test USDT transfer and sync again.`);
            }
            
            // Combine and sort events
            const allEvents = [...toEvents, ...fromEvents].sort((a, b) => {
                if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber;
                return (a.transactionIndex || 0) - (b.transactionIndex || 0);
            });
            
            // Convert events to transaction objects
            fetchedTransactions = await Promise.all(allEvents.map(async (event) => {
                const block = await provider.getBlock(event.blockNumber);
                
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
            console.error("❌ BSC PublicNode RPC Error:", error);
            throw new Error(`Failed to fetch from BSC public node: ${error.message}`);
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
                status: 'Confirmed', // All records confirmed by default
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
