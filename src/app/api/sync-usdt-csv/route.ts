import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    console.log('=== CSV SYNC API START ===');
    
    try {
        const body = await request.json();
        console.log('✓ Body parsed:', { apiId: body.apiId, rowCount: body.rows?.length });
        
        const { apiId, rows } = body;

        // Validate input
        if (!apiId || !rows || !Array.isArray(rows)) {
            console.log('✗ Invalid request: missing apiId or rows');
            return NextResponse.json(
                { error: 'Missing apiId or rows' },
                { status: 400 }
            );
        }

        console.log(`✓ Processing ${rows.length} rows...`);

        // Import Firebase here to avoid initialization issues
        const { db } = await import('@/lib/firebase');
        const { ref, get, update } = await import('firebase/database');
        const type = await import('@/lib/types');

        // Get API configuration
        console.log(`✓ Fetching API config: ${apiId}`);
        const apiSettingRef = ref(db, `bsc_apis/${apiId}`);
        const apiSettingSnapshot = await get(apiSettingRef);
        
        if (!apiSettingSnapshot.exists()) {
            console.log('✗ API config not found');
            return NextResponse.json(
                { error: 'API Configuration not found' },
                { status: 404 }
            );
        }

        const setting = apiSettingSnapshot.val();
        const { walletAddress, accountId, name: configName } = setting;

        if (!walletAddress || !accountId) {
            console.log('✗ Missing wallet or account');
            return NextResponse.json(
                { error: 'Missing wallet address or account ID' },
                { status: 400 }
            );
        }

        console.log(`✓ API config found: ${configName} | Wallet: ${walletAddress}`);

        // Get wallet account name
        const walletAccountRef = ref(db, `accounts/${accountId}`);
        const walletAccountSnapshot = await get(walletAccountRef);
        const cryptoWalletName = walletAccountSnapshot.exists()
            ? walletAccountSnapshot.val().name
            : 'Synced USDT Wallet';

        console.log(`✓ Wallet account: ${cryptoWalletName}`);

        const updates: { [key: string]: any } = {};
        let synced = 0;
        let skipped = 0;
        let sequenceCounter = 0;

        // Get current counter
        const counterRef = ref(db, 'counters/modernUsdtRecordId');
        const counterSnapshot = await get(counterRef);
        sequenceCounter = counterSnapshot.exists() ? counterSnapshot.val() || 0 : 0;
        console.log(`✓ Starting from counter: ${sequenceCounter}`);

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
            } catch (rowError: any) {
                console.error(`✗ Row error: ${rowError.message}`);
                skipped++;
            }
        }

        console.log(`✓ Processed: ${synced} synced, ${skipped} skipped`);

        // Write to database
        if (Object.keys(updates).length > 0) {
            updates['/counters/modernUsdtRecordId'] = sequenceCounter;
            console.log(`✓ Writing ${Object.keys(updates).length} operations to database...`);
            
            try {
                await update(ref(db), updates);
                console.log('✓ Database update complete');
            } catch (dbError: any) {
                console.error(`✗ Database error: ${dbError.message}`);
                return NextResponse.json(
                    { error: `Database error: ${dbError.message}` },
                    { status: 500 }
                );
            }
        }

        const response = {
            success: true,
            synced,
            skipped,
            configName,
            message: `Synced ${synced} records, skipped ${skipped}`,
        };

        console.log('=== CSV SYNC API SUCCESS ===');
        return NextResponse.json(response);
    } catch (error: any) {
        console.error('=== CSV SYNC API ERROR ===');
        console.error(`Error type: ${error.name}`);
        console.error(`Error message: ${error.message}`);
        if (error.stack) console.error(`Stack: ${error.stack.split('\n')[0]}`);
        
        return NextResponse.json(
            { error: `Server error: ${error.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}
