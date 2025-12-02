import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, set, push, remove } from 'firebase/database';
import { createCashReceipt, assignRecordToClient } from '@/lib/actions/financial-records';

interface TestResult {
    name: string;
    expected: string;
    actual: string;
    passed: boolean;
}

interface ScenarioResult {
    scenario: string;
    description: string;
    tests: TestResult[];
    passed: boolean;
}

async function getNextId(counterType: string): Promise<string> {
    const counterRef = ref(db, `counters/${counterType}`);
    const snapshot = await get(counterRef);
    const currentValue = snapshot.exists() ? (snapshot.val() as number) : 9000;
    const nextValue = currentValue + 1;
    await set(counterRef, nextValue);
    return String(nextValue);
}

async function findJournalEntriesForRecord(recordId: string): Promise<any[]> {
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    if (!journalSnapshot.exists()) return [];
    
    const entries: any[] = [];
    journalSnapshot.forEach((child) => {
        const entry = { id: child.key, ...child.val() as any };
        if (entry.description?.includes(`Rec #${recordId}`)) {
            entries.push(entry);
        }
    });
    
    return entries;
}

async function runScenario1_UnassignedCash(): Promise<ScenarioResult> {
    const tests: TestResult[] = [];
    const bankAccountId = '116';
    const amountUsd = 15.50;
    
    const formData = new FormData();
    formData.set('date', new Date().toISOString());
    formData.set('bankAccountId', bankAccountId);
    formData.set('clientId', '');
    formData.set('senderName', 'CHECKPOINT-UNASSIGNED-CASH');
    formData.set('amount', '60');
    formData.set('amountusd', String(amountUsd));
    formData.set('type', 'inflow');
    formData.set('note', 'Checkpoint - Unassigned Cash');
    
    const result = await createCashReceipt(null, undefined, formData);
    
    tests.push({
        name: 'createCashReceipt succeeds',
        expected: 'success: true',
        actual: result.success ? 'success: true' : `failed: ${result.message}`,
        passed: result.success === true
    });
    
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    let latestEntry: any = null;
    if (journalSnapshot.exists()) {
        const entries: any[] = [];
        journalSnapshot.forEach((child) => {
            entries.push({ id: child.key, ...child.val() as any });
        });
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].description?.includes('Unmatched') && 
                entries[i].description?.includes('CHECKPOINT-UNASSIGNED-CASH') === false &&
                entries[i].credit_account === '7001') {
                latestEntry = entries[i];
                break;
            }
        }
        if (!latestEntry) {
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].credit_account === '7001') {
                    latestEntry = entries[i];
                    break;
                }
            }
        }
    }
    
    tests.push({
        name: 'Journal entry DEBIT is bank account (asset)',
        expected: bankAccountId,
        actual: latestEntry?.debit_account || 'NOT FOUND',
        passed: latestEntry?.debit_account === bankAccountId
    });
    
    tests.push({
        name: 'Journal entry CREDIT is 7001 (unmatched liability)',
        expected: '7001',
        actual: latestEntry?.credit_account || 'NOT FOUND',
        passed: latestEntry?.credit_account === '7001'
    });
    
    return {
        scenario: 'SCENARIO 1',
        description: 'Unassigned Cash Inflow → DEBIT bank, CREDIT 7001',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario3_TransferCashToClient(): Promise<ScenarioResult> {
    const tests: TestResult[] = [];
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const bankAccountId = '116';
    const amountUsd = 22.50;
    
    const uniqueSender = `CHECKPOINT-TRANSFER-${Date.now()}`;
    const formData = new FormData();
    formData.set('date', new Date().toISOString());
    formData.set('bankAccountId', bankAccountId);
    formData.set('clientId', '');
    formData.set('senderName', uniqueSender);
    formData.set('amount', '85');
    formData.set('amountusd', String(amountUsd));
    formData.set('type', 'inflow');
    formData.set('note', 'Checkpoint - Cash for Transfer');
    
    const createResult = await createCashReceipt(null, undefined, formData);
    
    tests.push({
        name: 'Create unassigned record succeeds',
        expected: 'success: true',
        actual: createResult.success ? 'success: true' : `failed: ${createResult.message}`,
        passed: createResult.success === true
    });
    
    const cashRecordsSnapshot = await get(ref(db, 'cash_records'));
    let createdRecordId: string | null = null;
    if (cashRecordsSnapshot.exists()) {
        const records: any[] = [];
        cashRecordsSnapshot.forEach((child) => {
            records.push({ id: child.key, ...child.val() as any });
        });
        for (let i = records.length - 1; i >= 0; i--) {
            if (records[i].senderName === uniqueSender && !records[i].clientId) {
                createdRecordId = records[i].id;
                break;
            }
        }
    }
    
    if (createdRecordId) {
        const assignResult = await assignRecordToClient(createdRecordId, 'cash', clientId);
        
        tests.push({
            name: 'assignRecordToClient succeeds',
            expected: 'success: true',
            actual: assignResult.success ? 'success: true' : `failed: ${assignResult.message}`,
            passed: assignResult.success === true
        });
        
        const journalSnapshot = await get(ref(db, 'journal_entries'));
        let transferEntry: any = null;
        if (journalSnapshot.exists()) {
            const entries: any[] = [];
            journalSnapshot.forEach((child) => {
                entries.push({ id: child.key, ...child.val() as any });
            });
            for (let i = entries.length - 1; i >= 0; i--) {
                if (entries[i].description?.includes('Transfer') && 
                    entries[i].description?.includes(createdRecordId)) {
                    transferEntry = entries[i];
                    break;
                }
            }
        }
        
        tests.push({
            name: 'Transfer DEBIT is 7001 (unmatched decreasing)',
            expected: '7001',
            actual: transferEntry?.debit_account || 'NO TRANSFER ENTRY',
            passed: transferEntry?.debit_account === '7001'
        });
        
        tests.push({
            name: 'Transfer CREDIT is client account (6000{clientId})',
            expected: clientAccountId,
            actual: transferEntry?.credit_account || 'NO TRANSFER ENTRY',
            passed: transferEntry?.credit_account === clientAccountId
        });
        
        tests.push({
            name: 'Transfer is ONLY between liability accounts (no bank)',
            expected: 'true',
            actual: transferEntry ? String(
                transferEntry.debit_account === '7001' && 
                transferEntry.credit_account?.startsWith('6000')
            ) : 'NO ENTRY',
            passed: transferEntry?.debit_account === '7001' && 
                    transferEntry?.credit_account?.startsWith('6000')
        });
    } else {
        tests.push({
            name: 'Could not find created record to assign',
            expected: 'record found',
            actual: 'NOT FOUND',
            passed: false
        });
    }
    
    return {
        scenario: 'SCENARIO 3',
        description: 'Transfer Cash from 7001 → 6000{clientId} (liability to liability only)',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario5_DirectCashWithClient(): Promise<ScenarioResult> {
    const tests: TestResult[] = [];
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const bankAccountId = '116';
    const amountUsd = 18.75;
    
    const clientSnapshot = await get(ref(db, `clients/${clientId}`));
    const clientName = clientSnapshot.exists() ? (clientSnapshot.val() as any).name : 'Unknown';
    
    const formData = new FormData();
    formData.set('date', new Date().toISOString());
    formData.set('bankAccountId', bankAccountId);
    formData.set('clientId', clientId);
    formData.set('senderName', 'CHECKPOINT-DIRECT-CLIENT');
    formData.set('amount', '72');
    formData.set('amountusd', String(amountUsd));
    formData.set('type', 'inflow');
    formData.set('note', 'Checkpoint - Direct with Client');
    
    const result = await createCashReceipt(null, undefined, formData);
    
    tests.push({
        name: 'createCashReceipt with client succeeds',
        expected: 'success: true',
        actual: result.success ? 'success: true' : `failed: ${result.message}`,
        passed: result.success === true
    });
    
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    let latestEntry: any = null;
    if (journalSnapshot.exists()) {
        const entries: any[] = [];
        journalSnapshot.forEach((child) => {
            entries.push({ id: child.key, ...child.val() as any });
        });
        for (let i = entries.length - 1; i >= 0; i--) {
            if (entries[i].credit_account === clientAccountId && 
                !entries[i].description?.includes('Transfer')) {
                latestEntry = entries[i];
                break;
            }
        }
    }
    
    tests.push({
        name: 'Journal entry DEBIT is bank account (asset)',
        expected: bankAccountId,
        actual: latestEntry?.debit_account || 'NOT FOUND',
        passed: latestEntry?.debit_account === bankAccountId
    });
    
    tests.push({
        name: 'Journal entry CREDIT is client account (NOT 7001)',
        expected: clientAccountId,
        actual: latestEntry?.credit_account || 'NOT FOUND',
        passed: latestEntry?.credit_account === clientAccountId
    });
    
    tests.push({
        name: 'Journal entry did NOT go to 7001 (unmatched)',
        expected: 'NOT 7001',
        actual: latestEntry?.credit_account || 'NOT FOUND',
        passed: latestEntry?.credit_account !== '7001'
    });
    
    return {
        scenario: 'SCENARIO 5',
        description: 'Direct Cash Receipt with Client → DEBIT bank, CREDIT 6000{clientId}',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runBalanceCheck(): Promise<ScenarioResult> {
    const tests: TestResult[] = [];
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    let totalCredits = 0;
    let totalDebits = 0;
    let entryCount = 0;
    
    if (journalSnapshot.exists()) {
        journalSnapshot.forEach((child) => {
            const entry = child.val() as any;
            if (entry.credit_account === clientAccountId) {
                totalCredits += entry.credit_amount || 0;
                entryCount++;
            }
            if (entry.debit_account === clientAccountId) {
                totalDebits += entry.debit_amount || 0;
            }
        });
    }
    
    const calculatedBalance = totalCredits - totalDebits;
    
    tests.push({
        name: 'Client has journal entries',
        expected: 'entries > 0',
        actual: `${entryCount} entries`,
        passed: entryCount > 0
    });
    
    tests.push({
        name: 'Balance calculation is positive (we owe client)',
        expected: 'balance > 0',
        actual: `balance = ${calculatedBalance.toFixed(2)}`,
        passed: calculatedBalance > 0
    });
    
    return {
        scenario: 'BALANCE CHECK',
        description: `Client Balance for ${clientAccountId}`,
        tests,
        passed: tests.every(t => t.passed)
    };
}

export async function POST() {
    const results: ScenarioResult[] = [];
    
    try {
        results.push(await runScenario1_UnassignedCash());
        results.push(await runScenario3_TransferCashToClient());
        results.push(await runScenario5_DirectCashWithClient());
        results.push(await runBalanceCheck());
        
        let totalTests = 0;
        let passedTests = 0;
        
        for (const scenario of results) {
            for (const test of scenario.tests) {
                totalTests++;
                if (test.passed) passedTests++;
            }
        }
        
        return NextResponse.json({
            title: 'FINANCIAL SYSTEM CHECKPOINT TESTS',
            timestamp: new Date().toISOString(),
            scenarios: results,
            summary: {
                totalTests,
                passed: passedTests,
                failed: totalTests - passedTests,
                allPassed: results.every(r => r.passed)
            }
        });
    } catch (error) {
        return NextResponse.json({
            error: String(error),
            stack: (error as Error).stack,
            scenarios: results
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        description: 'POST to run comprehensive financial checkpoint tests',
        scenarios: [
            'SCENARIO 1: Unassigned Cash Inflow → DEBIT bank, CREDIT 7001',
            'SCENARIO 3: Transfer Cash 7001 → 6000{clientId}',
            'SCENARIO 5: Direct Cash with Client → DEBIT bank, CREDIT 6000{clientId}',
            'BALANCE CHECK: Verify client balance calculation'
        ]
    });
}
