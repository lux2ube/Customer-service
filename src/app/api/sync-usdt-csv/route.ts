import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update, push } from 'firebase/database';
import { stripUndefined, getNextSequentialId } from '@/lib/actions/helpers';
import { findClientByAddress } from '@/lib/actions/client';
import type { Account, BscApiSetting, ModernUsdtRecord, JournalEntry } from '@/lib/types';

const USDT_DECIMALS = 18;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiId, rows } = body;

        if (!apiId || !rows || !Array.isArray(rows)) {
            return NextResponse.json(
                { error: 'Missing apiId or rows' },
                { status: 400 }
            );
        }

        // Get API configuration
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        if (!apiSettingSnapshot.exists()) {
            return NextResponse.json(
                { error: `API Configuration with ID "${apiId}" not found.` },
                { status: 404 }
            );
        }

        const setting: BscApiSetting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName } = setting;

        if (!walletAddress || !accountId) {
            return NextResponse.json(
                { error: `API config "${configName}" is missing wallet address or linked account.` },
                { status: 400 }
            );
        }

        // Get wallet account name
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists()
            ? (walletAccountSnapshot.val() as Account).name
            : 'Synced USDT Wallet';

        const updates: { [key: string]: any } = {};
        let synced = 0;
        let skipped = 0;

        // Process each row in the batch
        for (const row of rows) {
            const {
                hash,
                blockNumber,
                timeStamp,
                from,
                to,
                amount,
            } = row;

            // Validate required fields
            if (!hash || !from || !to || !timeStamp || amount === undefined) {
                skipped++;
                continue;
            }

            const syncedAmount = parseFloat(amount.toString());
            if (syncedAmount <= 0.01) {
                skipped++;
                continue;
            }

            // Determine if inflow or outflow
            const isIncoming = to.toLowerCase() === walletAddress.toLowerCase();
            const clientWalletAddress = isIncoming ? from : to;

            // Find matching client
            const existingClient = await findClientByAddress(clientWalletAddress);

            // Generate record ID
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

            // Store record
            updates[`/modern_usdt_records/${newRecordId}`] = {
                id: newRecordId,
                ...stripUndefined(newTxData),
                blockNumber: parseInt(blockNumber),
            };

            // Create journal entry if client found
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
            }

            synced++;
        }

        // Write all updates to database
        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        return NextResponse.json({
            success: true,
            synced,
            skipped,
            configName,
        });
    } catch (error: any) {
        console.error('CSV Sync API Error:', error);
        return NextResponse.json(
            { error: error.message || 'An error occurred during sync.' },
            { status: 500 }
        );
    }
}
