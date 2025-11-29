import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { apiId, rows } = body;

        if (!apiId || !rows?.length) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        // Return immediately - don't do async Firebase here
        // Just process locally and return
        const processed = rows.map((row: any) => ({
            ...row,
            processed: true
        }));

        return NextResponse.json({
            success: true,
            synced: processed.length,
            skipped: 0,
            message: `Test: Received ${processed.length} rows`
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }
}
