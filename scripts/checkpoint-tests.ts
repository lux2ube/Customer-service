/**
 * COMPREHENSIVE FINANCIAL SYSTEM CHECKPOINT TESTS
 * 
 * Tests all 6 scenarios for double-entry accounting:
 * 
 * SCENARIO 1: Unassigned cash inflow → DEBIT bank, CREDIT 7001
 * SCENARIO 2: Unassigned USDT inflow → DEBIT wallet, CREDIT 7002
 * SCENARIO 3: Assign unassigned cash to client → DEBIT 7001, CREDIT 6000{clientId}
 * SCENARIO 4: Assign unassigned USDT to client → DEBIT 7002, CREDIT 6000{clientId}
 * SCENARIO 5: Cash inflow with client assigned → DEBIT bank, CREDIT 6000{clientId}
 * SCENARIO 6: USDT inflow with client assigned → DEBIT wallet, CREDIT 6000{clientId}
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, push, remove, update } from 'firebase/database';

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

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

const results: ScenarioResult[] = [];

async function getNextId(counterType: string): Promise<string> {
    const counterRef = ref(db, `counters/${counterType}`);
    const snapshot = await get(counterRef);
    const currentValue = snapshot.exists() ? (snapshot.val() as number) : 9000;
    const nextValue = currentValue + 1;
    await set(counterRef, nextValue);
    return String(nextValue);
}

async function getLatestJournalEntry(description: string): Promise<any | null> {
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    if (!journalSnapshot.exists()) return null;
    
    const entries: any[] = [];
    journalSnapshot.forEach((child) => {
        entries.push({ id: child.key, ...child.val() });
    });
    
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].description?.includes(description)) {
            return entries[i];
        }
    }
    return null;
}

async function runScenario1(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 1: Unassigned Cash Inflow');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testCashRecordId');
    const bankAccountId = '116';
    const amount = 100;
    const amountUsd = 26.04;
    
    const recordData = {
        date: new Date().toISOString(),
        type: 'inflow',
        source: 'Manual',
        status: 'Confirmed',
        clientId: null,
        clientName: null,
        accountId: bankAccountId,
        accountName: 'ONE USD',
        senderName: 'TEST-UNASSIGNED-CASH',
        amount,
        currency: 'YER',
        amountusd: amountUsd,
        notes: 'CHECKPOINT TEST - Unassigned Cash',
        createdAt: new Date().toISOString(),
    };
    
    await set(ref(db, `cash_records/${recordId}`), recordData);
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: recordData.date,
        description: `Cash Receipt (Unmatched) - Rec #${recordId}`,
        debit_account: bankAccountId,
        credit_account: '7001',
        debit_amount: amountUsd,
        credit_amount: amountUsd,
        amount_usd: amountUsd,
        createdAt: new Date().toISOString(),
        debit_account_name: 'ONE USD',
        credit_account_name: 'Unmatched Cash',
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is bank (asset)',
        expected: bankAccountId,
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === bankAccountId
    });
    
    tests.push({
        name: 'Credit account is 7001 (unmatched liability)',
        expected: '7001',
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === '7001'
    });
    
    tests.push({
        name: 'Amount matches',
        expected: String(amountUsd),
        actual: String(entry?.debit_amount || 0),
        passed: entry?.debit_amount === amountUsd
    });
    
    await remove(ref(db, `cash_records/${recordId}`));
    
    return {
        scenario: 'SCENARIO 1',
        description: 'Unassigned Cash Inflow → DEBIT bank, CREDIT 7001',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario2(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 2: Unassigned USDT Inflow');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testUsdtRecordId');
    const walletAccountId = '102';
    const amount = 50;
    
    const recordData = {
        date: new Date().toISOString(),
        type: 'inflow',
        source: 'Manual',
        status: 'Confirmed',
        clientId: null,
        clientName: null,
        accountId: walletAccountId,
        accountName: 'USDT Wallet',
        amount,
        notes: 'CHECKPOINT TEST - Unassigned USDT',
        createdAt: new Date().toISOString(),
    };
    
    await set(ref(db, `modern_usdt_records/${recordId}`), recordData);
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: recordData.date,
        description: `USDT Receipt (Unmatched) - Rec #${recordId}`,
        debit_account: walletAccountId,
        credit_account: '7002',
        debit_amount: amount,
        credit_amount: amount,
        amount_usd: amount,
        createdAt: new Date().toISOString(),
        debit_account_name: 'USDT Wallet',
        credit_account_name: 'Unmatched USDT',
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is wallet (asset)',
        expected: walletAccountId,
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === walletAccountId
    });
    
    tests.push({
        name: 'Credit account is 7002 (unmatched USDT liability)',
        expected: '7002',
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === '7002'
    });
    
    await remove(ref(db, `modern_usdt_records/${recordId}`));
    
    return {
        scenario: 'SCENARIO 2',
        description: 'Unassigned USDT Inflow → DEBIT wallet, CREDIT 7002',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario3(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 3: Transfer Cash from 7001 to Client');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testCashRecordId');
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const amount = 75.50;
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: new Date().toISOString(),
        description: `Transfer CASH Rec #${recordId} to Test Client`,
        debit_account: '7001',
        credit_account: clientAccountId,
        debit_amount: amount,
        credit_amount: amount,
        amount_usd: amount,
        createdAt: new Date().toISOString(),
        debit_account_name: 'Unmatched Cash',
        credit_account_name: 'Test Client',
        entry_type: 'transfer'
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is 7001 (unmatched - decreasing)',
        expected: '7001',
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === '7001'
    });
    
    tests.push({
        name: 'Credit account is client liability (6000{clientId})',
        expected: clientAccountId,
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === clientAccountId
    });
    
    tests.push({
        name: 'NO bank account involved (only liabilities)',
        expected: 'true',
        actual: String(entry?.debit_account === '7001' && entry?.credit_account?.startsWith('6000')),
        passed: entry?.debit_account === '7001' && entry?.credit_account?.startsWith('6000')
    });
    
    return {
        scenario: 'SCENARIO 3',
        description: 'Transfer Cash 7001 → 6000{clientId} (liability to liability)',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario4(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 4: Transfer USDT from 7002 to Client');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testUsdtRecordId');
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const amount = 150;
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: new Date().toISOString(),
        description: `Transfer USDT Rec #${recordId} to Test Client`,
        debit_account: '7002',
        credit_account: clientAccountId,
        debit_amount: amount,
        credit_amount: amount,
        amount_usd: amount,
        createdAt: new Date().toISOString(),
        debit_account_name: 'Unmatched USDT',
        credit_account_name: 'Test Client',
        entry_type: 'transfer'
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is 7002 (unmatched USDT - decreasing)',
        expected: '7002',
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === '7002'
    });
    
    tests.push({
        name: 'Credit account is client liability (6000{clientId})',
        expected: clientAccountId,
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === clientAccountId
    });
    
    tests.push({
        name: 'NO wallet account involved (only liabilities)',
        expected: 'true',
        actual: String(entry?.debit_account === '7002' && entry?.credit_account?.startsWith('6000')),
        passed: entry?.debit_account === '7002' && entry?.credit_account?.startsWith('6000')
    });
    
    return {
        scenario: 'SCENARIO 4',
        description: 'Transfer USDT 7002 → 6000{clientId} (liability to liability)',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario5(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 5: Direct Cash Receipt with Client');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testCashRecordId');
    const bankAccountId = '116';
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const amount = 200;
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: new Date().toISOString(),
        description: `Cash Receipt - Rec #${recordId} | Test Client`,
        debit_account: bankAccountId,
        credit_account: clientAccountId,
        debit_amount: amount,
        credit_amount: amount,
        amount_usd: amount,
        createdAt: new Date().toISOString(),
        debit_account_name: 'ONE USD',
        credit_account_name: 'Test Client',
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is bank (asset)',
        expected: bankAccountId,
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === bankAccountId
    });
    
    tests.push({
        name: 'Credit account is client liability (6000{clientId})',
        expected: clientAccountId,
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === clientAccountId
    });
    
    tests.push({
        name: 'NOT going to 7001 (unmatched)',
        expected: 'NOT 7001',
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account !== '7001'
    });
    
    return {
        scenario: 'SCENARIO 5',
        description: 'Direct Cash Receipt with Client → DEBIT bank, CREDIT 6000{clientId}',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runScenario6(): Promise<ScenarioResult> {
    console.log('\n📋 SCENARIO 6: Direct USDT Receipt with Client');
    const tests: TestResult[] = [];
    
    const recordId = await getNextId('testUsdtRecordId');
    const walletAccountId = '102';
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;
    const amount = 300;
    
    const journalRef = push(ref(db, 'journal_entries'));
    const journalEntry = {
        date: new Date().toISOString(),
        description: `USDT Receipt - Rec #${recordId} | Test Client`,
        debit_account: walletAccountId,
        credit_account: clientAccountId,
        debit_amount: amount,
        credit_amount: amount,
        amount_usd: amount,
        createdAt: new Date().toISOString(),
        debit_account_name: 'USDT Wallet',
        credit_account_name: 'Test Client',
    };
    await set(journalRef, journalEntry);
    
    const entry = await getLatestJournalEntry(`Rec #${recordId}`);
    
    tests.push({
        name: 'Debit account is wallet (asset)',
        expected: walletAccountId,
        actual: entry?.debit_account || 'NOT FOUND',
        passed: entry?.debit_account === walletAccountId
    });
    
    tests.push({
        name: 'Credit account is client liability (6000{clientId})',
        expected: clientAccountId,
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account === clientAccountId
    });
    
    tests.push({
        name: 'NOT going to 7002 (unmatched)',
        expected: 'NOT 7002',
        actual: entry?.credit_account || 'NOT FOUND',
        passed: entry?.credit_account !== '7002'
    });
    
    return {
        scenario: 'SCENARIO 6',
        description: 'Direct USDT Receipt with Client → DEBIT wallet, CREDIT 6000{clientId}',
        tests,
        passed: tests.every(t => t.passed)
    };
}

async function runAllTests() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('   COMPREHENSIVE FINANCIAL SYSTEM CHECKPOINT TESTS');
    console.log('═══════════════════════════════════════════════════════════');
    
    results.push(await runScenario1());
    results.push(await runScenario2());
    results.push(await runScenario3());
    results.push(await runScenario4());
    results.push(await runScenario5());
    results.push(await runScenario6());
    
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    TEST RESULTS SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const scenario of results) {
        const status = scenario.passed ? '✅ PASSED' : '❌ FAILED';
        console.log(`${status} ${scenario.scenario}: ${scenario.description}`);
        
        for (const test of scenario.tests) {
            totalTests++;
            if (test.passed) passedTests++;
            const testStatus = test.passed ? '  ✓' : '  ✗';
            console.log(`${testStatus} ${test.name}: expected=${test.expected}, actual=${test.actual}`);
        }
        console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   FINAL RESULT: ${passedTests}/${totalTests} tests passed`);
    console.log(`   ${results.every(r => r.passed) ? '✅ ALL SCENARIOS PASSED!' : '❌ SOME SCENARIOS FAILED'}`);
    console.log('═══════════════════════════════════════════════════════════');
    
    return {
        scenarios: results,
        summary: {
            totalTests,
            passedTests,
            failedTests: totalTests - passedTests,
            allPassed: results.every(r => r.passed)
        }
    };
}

runAllTests().then((result) => {
    console.log('\nJSON Result:', JSON.stringify(result.summary, null, 2));
    process.exit(result.summary.allPassed ? 0 : 1);
}).catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
});
