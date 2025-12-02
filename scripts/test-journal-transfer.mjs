#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, push, set } from 'firebase/database';

// Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const log = (title, data) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log(JSON.stringify(data, null, 2));
};

async function testJournalTransfer() {
  try {
    console.log('🚀 STARTING JOURNAL TRANSFER TEST\n');

    // STEP 1: Get initial account states
    console.log('📊 STEP 1: Initial Account States');
    const accountsRef = ref(db, 'accounts');
    const accountsSnapshot = await get(accountsRef);
    const allAccounts = accountsSnapshot.val() || {};

    const account7001 = allAccounts['7001'] || { name: 'Unmatched Cash (Not Found)' };
    log('Account 7001 (Unmatched Cash)', { ...account7001, id: '7001' });

    // STEP 2: Get test client
    console.log('\n📊 STEP 2: Finding Test Client');
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClient = null;
    for (const [id, client] of Object.entries(allClients)) {
      if (client.name === 'Test balance') {
        testClient = { id, ...client };
        break;
      }
    }

    if (!testClient) {
      console.log('❌ Test client "Test balance" not found!');
      return;
    }

    log('Test Client Found', testClient);
    const clientAccountId = `6000${testClient.id}`;

    // STEP 3: Get current journal entries for 7001
    console.log('\n📊 STEP 3: Current Journal Entries (Before Transfer)');
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    const entriesFor7001Before = Object.entries(allJournals)
      .filter(([_, entry]) => entry.debit_account === '7001' || entry.credit_account === '7001')
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const entriesForClientBefore = Object.entries(allJournals)
      .filter(([_, entry]) => entry.debit_account === clientAccountId || entry.credit_account === clientAccountId)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    log('Journal Entries on 7001 (Before)', entriesFor7001Before);
    log('Journal Entries on Client (Before)', entriesForClientBefore);

    // STEP 4: Calculate balances BEFORE
    console.log('\n📊 STEP 4: Calculate Current Balances (Before)');
    const balance7001Before = entriesFor7001Before.reduce((acc, entry) => {
      const change = entry.credit_account === '7001' ? entry.credit_amount : -entry.debit_amount;
      return acc + change;
    }, 0);

    const balanceClientBefore = entriesForClientBefore.reduce((acc, entry) => {
      const change = entry.credit_account === clientAccountId ? entry.credit_amount : -entry.debit_amount;
      return acc + change;
    }, 0);

    log('Account Balances (Before)', {
      '7001 (Unmatched Cash)': balance7001Before,
      [clientAccountId]: balanceClientBefore,
      'Test Client': testClient.name
    });

    // STEP 5: Check for test transfer entries already created
    console.log('\n📊 STEP 5: Looking for Test Transfer Entries');
    const transferEntries = Object.entries(allJournals)
      .filter(([_, entry]) => 
        entry.description?.includes('Transfer') && 
        (entry.debit_account === '7001' || entry.credit_account === '7001') &&
        (entry.debit_account === clientAccountId || entry.credit_account === clientAccountId)
      )
      .map(([id, entry]) => ({ id, ...entry }));

    if (transferEntries.length > 0) {
      log('Recent Transfer Entries Found', transferEntries.slice(-3));
    } else {
      console.log('⚠️  No transfer entries found between 7001 and client account');
    }

    // STEP 6: Show most recent entries across all accounts
    console.log('\n📊 STEP 6: Recent Journal Entries (All Accounts)');
    const recentEntries = Object.entries(allJournals)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    log('Last 5 Journal Entries', recentEntries);

    // STEP 7: Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`
7001 Balance (Unmatched Cash):     ${balance7001Before.toFixed(2)} USD
${clientAccountId} (${testClient.name}):     ${balanceClientBefore.toFixed(2)} USD

Journal Entries on 7001:           ${entriesFor7001Before.length}
Journal Entries on Client:         ${entriesForClientBefore.length}
Transfer Entries Found:            ${transferEntries.length}

✓ Ready for testing:
  1. Create a cash record WITHOUT selecting a client
  2. Confirm it goes to 7001 (balance should increase)
  3. Assign the record to "${testClient.name}"
  4. Run this script again to verify transfer
`);

    // Show expected vs actual
    if (transferEntries.length > 0) {
      const lastTransfer = transferEntries[transferEntries.length - 1];
      console.log(`📌 Last Transfer Entry:`);
      console.log(`   Date: ${lastTransfer.date}`);
      console.log(`   DEBIT: ${lastTransfer.debit_account} $${lastTransfer.debit_amount}`);
      console.log(`   CREDIT: ${lastTransfer.credit_account} $${lastTransfer.credit_amount}`);
      console.log(`   Description: ${lastTransfer.description}`);
    }

    console.log(`\n${'='.repeat(60)}\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testJournalTransfer().then(() => {
  console.log('✅ Test complete');
  process.exit(0);
});
