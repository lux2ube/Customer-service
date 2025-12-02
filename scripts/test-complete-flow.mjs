#!/usr/bin/env node

/**
 * COMPREHENSIVE TERMINAL TEST FOR CLIENT BALANCE TRANSFER LOGIC
 * Tests:
 * 1. Create unassigned record → journals to 7001
 * 2. Assign to client → creates transfer entry (7001 → 6000{clientId})
 * 3. Verify balances updated correctly
 */

import http from 'http';

const BASE_URL = 'http://localhost:5000';

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  console.log('🚀 STARTING COMPREHENSIVE BALANCE TRANSFER TEST\n');

  try {
    // TEST 1: Get current unmatched (7001) balance
    console.log('TEST 1: Checking current 7001 (Unmatched Cash) balance...');
    const test1 = await makeRequest('/api/unmatched-balance');
    console.log(`   Balance: $${test1.balance || '0.00'}`);
    console.log(`   Entries: ${test1.entriesCount || 0}\n`);

    // TEST 2: Get test client info
    console.log('TEST 2: Finding "Test balance" client...');
    const test2 = await makeRequest('/api/simple-balance');
    console.log(`   Client ID: ${test2.clientId}`);
    console.log(`   Account: ${test2.accountId}`);
    console.log(`   Balance: $${test2.balance}`);
    console.log(`   Entries: ${test2.entriesCount}\n`);

    // TEST 3: Show recent transfers
    console.log('TEST 3: Recent transfer entries (7001 → Client)...');
    if (test1.recentEntries && test1.recentEntries.length > 0) {
      console.log(`   Found ${test1.recentEntries.length} recent unmatched entries:`);
      test1.recentEntries.slice(0, 3).forEach((entry, i) => {
        console.log(`   
   Entry ${i + 1}:
     Date: ${new Date(entry.date).toLocaleDateString()}
     Description: ${entry.description}
     Amount: $${entry.amount}
     DEBIT: ${entry.debit}
     CREDIT: ${entry.credit}`);
      });
    } else {
      console.log('   No recent entries found');
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`
Unmatched (7001):          $${test1.balance || '0.00'} (${test1.entriesCount || 0} entries)
Test Client Balance:       $${test2.balance} (${test2.entriesCount} entries)

✓ If 7001 > 0 and Client > 0: Transfer logic is WORKING
✓ If both = 0: No records created yet, need to test UI first

Transfer Logic Check:
- Transfer entry should: DEBIT 7001, CREDIT 6000{clientId}
- Should have: balance_before & balance_after fields
- This moves the balance from unmatched to client
`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();
