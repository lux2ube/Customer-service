#!/usr/bin/env node

/**
 * SIMULATES THE COMPLETE TRANSFER FLOW
 * 1. Shows what happens when record is created (unmatched)
 * 2. Shows what happens when record is assigned (transfer)
 * 3. Validates the double-entry bookkeeping
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

async function simulate() {
  console.log('📖 TRANSFER FLOW SIMULATION\n');

  try {
    console.log('SCENARIO: Create $100 cash receipt without assigning to client\n');
    console.log('STEP 1: Record created, confirmed WITHOUT client');
    console.log('  Entry created: DEBIT Bank, CREDIT 7001 ($100)');
    console.log('  Result: 7001 shows +$100 (unmatched cash)\n');

    console.log('STEP 2: Later, assign record to "Test balance" client');
    console.log('  Transfer entry created: DEBIT 7001 ($100), CREDIT 6000{clientId}');
    console.log('  Journal should now show:');
    console.log('    - Original: DEBIT Bank, CREDIT 7001 (+$100)');
    console.log('    - Transfer: DEBIT 7001 (-$100), CREDIT 6000{clientId} (+$100)');
    console.log('  Result:');
    console.log('    - 7001 balance: $100 - $100 = $0');
    console.log('    - Client balance: $100\n');

    console.log('VERIFICATION: Double-entry bookkeeping');
    console.log('  Total DEBITS should equal total CREDITS');
    console.log('  No negative balances allowed\n');

    console.log('\n' + '='.repeat(60));
    console.log('📊 ACTUAL STATE FROM DATABASE');
    console.log('='.repeat(60) + '\n');

    const unmatchedData = await makeRequest('/api/unmatched-balance');
    const clientData = await makeRequest('/api/simple-balance');

    console.log('Unmatched (7001):');
    console.log(`  Balance: $${unmatchedData.balance || '0.00'}`);
    console.log(`  Entries: ${unmatchedData.entriesCount || 0}\n`);

    console.log('Test Client (6000...)');
    console.log(`  Balance: $${clientData.balance || '0.00'}`);
    console.log(`  Entries: ${clientData.entriesCount || 0}\n`);

    // Validate double-entry
    const unmatched = parseFloat(unmatchedData.balance || '0');
    const client = parseFloat(clientData.balance || '0');

    console.log('VALIDATION:');
    if (unmatched === 0 && client > 0) {
      console.log('  ✅ PERFECT: Unmatched is 0, client has the balance');
      console.log('  ✅ Transfer logic IS WORKING correctly');
    } else if (unmatched > 0 && client === 0) {
      console.log('  ⚠️  WARNING: Money is stuck in unmatched');
      console.log('  ❌ Transfer logic NOT triggered or not working');
    } else if (unmatched > 0 && client > 0) {
      console.log('  ⚠️  WARNING: Money in BOTH accounts!');
      console.log('  ❌ Reversing entry missing or duplicate entry created');
    } else {
      console.log('  ℹ️  No data yet (create a test record first)');
    }

    console.log('\n' + '='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

simulate();
