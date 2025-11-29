import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';
import type { Account, BscApiSetting, ModernUsdtRecord } from '@/lib/types';

export async function POST(request: NextRequest) {
    console.log('=== CSV SYNC API START ===');
    
    try {
        const body = await request.json();
        console.log('Body received:', { apiId: body.apiId, rowCount: body.rows?.length });
        
        const { apiId, rows } = body;

        if (!apiId || !rows || !Array.isArray(rows)) {
            console.log('Invalid request data');
            return NextResponse.json(
                { error: 'Missing apiId or rows' },
                { status: 400 }
            );
        }

        // Get API configuration
        console.log('Fetching API config:', apiId);
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        
        if (!apiSettingSnapshot.exists()) {
            console.log('API config not found');
            return NextResponse.json(
                { error: `API Configuration not found` },
                { status: 404 }
            );
        }

        const setting: BscApiSetting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName } = setting;

        if (!walletAddress || !accountId) {
            console.log('Missing wallet or account');
            return NextResponse.json(
                { error: `Missing wallet address or account ID` },
                { status: 400 }
            );
        }

        console.log('API config found:', { configName, accountId });

        // Get wallet account name
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists()
            ? (walletAccountSnapshot.val() as Account).name
            : 'Synced USDT Wallet';

        console.log('Wallet account name:', cryptoWalletName);

        const updates: { [key: string]: any } = {};
        let synced = 0;
        let skipped = 0;
        let sequenceCounter = 0;

        // Get current counter for record IDs
        const counterRef = ref(db, 'counters/modernUsdtRecordId');
        const counterSnapshot = await get(counterRef);
        if (counterSnapshot.exists()) {
            sequenceCounter = counterSnapshot.val() || 0;
        }

        // Process each row in the batch
        for (const row of rows) {
            try {
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

                const syncedAmount = parseFloat(String(amount));
                if (syncedAmount <= 0.01) {
                    skipped++;
                    continue;
                }

                // Determine if inflow or outflow
                const isIncoming = String(to).toLowerCase() === String(walletAddress).toLowerCase();
                const clientWalletAddress = isIncoming ? String(from) : String(to);

                // Generate record ID (USDT1, USDT2, etc)
                sequenceCounter++;
                const newRecordId = `USDT${sequenceCounter}`;

                // Create record without client lookup (to avoid async issues)
                const newTxData: ModernUsdtRecord = {
                    id: newRecordId,
                    date: new Date(parseInt(String(timeStamp)) * 1000).toISOString(),
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

                // Store record
                updates[`/modern_usdt_records/${newRecordId}`] = newTxData;
                synced++;
                
                console.log(`Row ${synced}: ${newRecordId} - ${syncedAmount} USDT`);
            } catch (rowError: any) {
                console.error('Row processing error:', rowError);
                skipped++;
            }
        }

        console.log(`Processing complete: ${synced} synced, ${skipped} skipped`);

        // Update counter and write all records
        if (Object.keys(updates).length > 0) {
            updates['/counters/modernUsdtRecordId'] = sequenceCounter;
            console.log('Writing to database...');
            await update(ref(db), updates);
            console.log('Database update complete');
        }

        const response = {
            success: true,
            synced,
            skipped,
            configName,
        };

        console.log('=== CSV SYNC API SUCCESS ===');
        return NextResponse.json(response);
    } catch (error: any) {
        console.error('=== CSV SYNC API ERROR ===');
        console.error('Error:', error);
        console.error('Stack:', error?.stack);
        
        return NextResponse.json(
            { error: `Server error: ${String(error?.message || 'Unknown error')}` },
            { status: 500 }
        );
    }
}
