#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCeXpvJgcvOcp49c-jKX3hLBWvO9tzuYk0",
  authDomain: "crmp2p-86b24.firebaseapp.com",
  projectId: "crmp2p-86b24",
  storageBucket: "crmp2p-86b24.appspot.com",
  messagingSenderId: "818879362173",
  appId: "1:818879362173:android:5fb45ca7ec77d654ea2d14",
  databaseURL: "https://crmp2p-86b24-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function performClosingEntries() {
  console.log('='.repeat(60));
  console.log('CLOSING ENTRIES - NEW FINANCIAL PERIOD');
  console.log('='.repeat(60));
  console.log('');
  
  const closingDate = new Date().toISOString();
  const closingDateFormatted = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  console.log(`Closing Date: ${closingDateFormatted}`);
  console.log('');
  
  try {
    const accountsSnapshot = await get(ref(db, 'accounts'));
    
    if (!accountsSnapshot.exists()) {
      console.log('No accounts found in database.');
      process.exit(1);
    }
    
    const accounts = accountsSnapshot.val();
    const updates = {};
    
    let accountsReset = 0;
    
    console.log('Account Balances Before Closing:');
    console.log('-'.repeat(60));
    
    for (const [accountId, account] of Object.entries(accounts)) {
      const previousBalance = account.balance || 0;
      const accountName = account.name || accountId;
      
      if (previousBalance !== 0) {
        console.log(`  ${accountId} - ${accountName}: $${previousBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
      }
      
      updates[`accounts/${accountId}/balance`] = 0;
      updates[`accounts/${accountId}/lastBalanceUpdate`] = closingDate;
      updates[`accounts/${accountId}/closedBalance`] = previousBalance;
      updates[`accounts/${accountId}/lastClosingDate`] = closingDate;
      accountsReset++;
    }
    
    console.log('-'.repeat(60));
    console.log(`Total accounts: ${accountsReset}`);
    console.log('');
    
    updates['settings/financialPeriodStartDate'] = closingDate;
    updates['settings/lastClosingDate'] = closingDate;
    
    console.log('Applying closing entries...');
    await update(ref(db), updates);
    
    console.log('');
    console.log('='.repeat(60));
    console.log('CLOSING ENTRIES COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log(`- ${accountsReset} accounts reset to zero balance`);
    console.log(`- Financial period now starts from: ${closingDateFormatted}`);
    console.log(`- Previous balances preserved in 'closedBalance' field`);
    console.log(`- All historical records remain intact`);
    console.log('');
    console.log('Future balance calculations will only consider');
    console.log('journal entries created after this closing date.');
    console.log('');
    
    process.exit(0);
    
  } catch (error) {
    console.error('Error performing closing entries:', error.message);
    process.exit(1);
  }
}

performClosingEntries();
