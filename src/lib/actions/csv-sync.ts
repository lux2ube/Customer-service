'use server';

import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';

export async function syncUsdtCsvBatch(apiId: string, rows: any[]) {
    try {
        // Get API configuration
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        
        if (!apiSettingSnapshot.exists()) {
            throw new Error('API Configuration not found');
        }

        const setting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName } = setting;

        if (!walletAddress || !accountId) {
            throw new Error('Missing wallet address or account ID');
        }

        // Get wallet account name
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists()
            ? walletAccountSnapshot.val().name
            : 'Synced USDT Wallet';

        const updates: { [key: string]: any } = {};
        let synced = 0;
        let skipped = 0;

        // Get current counter
        const counterRef = ref(db, 'counters/modernUsdtRecordId');
        const counterSnapshot = await get(counterRef);
        let sequenceCounter = counterSnapshot.exists() ? counterSnapshot.val() || 0 : 0;

        // Process rows
        for (const row of rows) {
            try {
                const { hash, blockNumber, timeStamp, from, to, amount } = row;

                if (!hash || !from || !to || !timeStamp || amount === undefined) {
                    skipped++;
                    continue;
                }

                const syncedAmount = parseFloat(String(amount));
                if (syncedAmount <= 0.01) {
                    skipped++;
                    continue;
                }

                const isIncoming = String(to).toLowerCase() === String(walletAddress).toLowerCase();
                const clientWalletAddress = isIncoming ? String(from) : String(to);

                sequenceCounter++;
                const newRecordId = `USDT${sequenceCounter}`;
                const dateISO = new Date(parseInt(String(timeStamp)) * 1000).toISOString();

                const newTxData = {
                    id: newRecordId,
                    date: dateISO,
                    type: isIncoming ? 'inflow' : 'outflow',
                    source: 'CSV',
                    status: 'Confirmed',
                    clientId: null,
                    clientName: 'Unassigned',
                    accountId: accountId,
                    accountName: cryptoWalletName,
                    amount: syncedAmount,
                    clientWalletAddress: clientWalletAddress,
                    txHash: String(hash),
                    notes: `Synced from CSV: ${configName}`,
                    createdAt: new Date().toISOString(),
                };

                updates[`/modern_usdt_records/${newRecordId}`] = newTxData;
                synced++;
            } catch (rowError) {
                skipped++;
            }
        }

        // Write to database
        if (Object.keys(updates).length > 0) {
            updates['/counters/modernUsdtRecordId'] = sequenceCounter;
            await update(ref(db), updates);
        }

        return {
            success: true,
            synced,
            skipped,
            configName,
        };
    } catch (error: any) {
        throw new Error(error.message || 'Sync failed');
    }
}
