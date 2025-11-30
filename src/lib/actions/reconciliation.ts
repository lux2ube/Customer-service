'use server';

import { db } from '../firebase';
import { ref, get, update, push, set } from 'firebase/database';
import type { Transaction, JournalEntry } from '../types';
import { getClientBalance, detectDuplicates } from './balance';

/**
 * RECONCILIATION MODULE - PREVENT AND DETECT DUPLICATE JOURNAL ENTRIES
 * 
 * Ensures that:
 * 1. Each transaction creates exactly ONE set of journal entries
 * 2. No record is processed twice
 * 3. All entries are balanced
 * 4. Reversals are properly tracked
 */

export interface ReconciliationReport {
  transactionId: string;
  status: 'verified' | 'duplicates_found' | 'unbalanced' | 'error';
  journalEntriesCreated: number;
  entriesAreBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  duplicateCount: number;
  warnings: string[];
}

/**
 * SAFEGUARD #1: Prevent duplicate journal entry creation during transaction posting
 * 
 * Called BEFORE saving journal entries to ensure:
 * - No journal entries already exist for this transaction
 * - No duplicate transaction IDs in recent entries
 */
export async function verifyNoExistingEntries(
  transactionId: string
): Promise<{
  isClean: boolean;
  existingEntries: JournalEntry[];
  errorMessage?: string;
}> {
  try {
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    if (!journalSnapshot.exists()) {
      return { isClean: true, existingEntries: [] };
    }
    
    const allEntries = journalSnapshot.val();
    const existingEntries: JournalEntry[] = [];
    
    // Search for entries mentioning this transaction
    for (const entry of Object.values(allEntries)) {
      const jEntry = entry as JournalEntry;
      if (jEntry.description.includes(`Tx #${transactionId}`)) {
        existingEntries.push(jEntry);
      }
    }
    
    if (existingEntries.length > 0) {
      return {
        isClean: false,
        existingEntries,
        errorMessage: `Journal entries already exist for transaction ${transactionId}`
      };
    }
    
    return { isClean: true, existingEntries: [] };
    
  } catch (error) {
    console.error('Error verifying journal entries:', error);
    return {
      isClean: false,
      existingEntries: [],
      errorMessage: `Error during verification: ${error}`
    };
  }
}

/**
 * SAFEGUARD #2: Prevent duplicate record status updates
 * 
 * Ensures each record is marked "Used" exactly once
 */
export async function verifyRecordsNotAlreadyUsed(
  recordIds: { recordId: string; recordType: 'cash' | 'usdt' }[]
): Promise<{
  allClean: boolean;
  alreadyUsedRecords: {
    recordId: string;
    status: string;
    linkedTransactions: string[];
  }[];
}> {
  
  const alreadyUsedRecords: {
    recordId: string;
    status: string;
    linkedTransactions: string[];
  }[] = [];
  
  try {
    for (const { recordId, recordType } of recordIds) {
      const recordPath = recordType === 'cash' ? 'cash_records' : 'modern_usdt_records';
      const recordSnapshot = await get(ref(db, `${recordPath}/${recordId}`));
      
      if (recordSnapshot.exists()) {
        const record = recordSnapshot.val();
        
        if (record.status === 'Used') {
          // Find which transactions use this record
          const transactionsSnapshot = await get(ref(db, 'modern_transactions'));
          const linkedTxs: string[] = [];
          
          if (transactionsSnapshot.exists()) {
            for (const [txId, tx] of Object.entries(transactionsSnapshot.val())) {
              const transaction = tx as Transaction;
              const allLegs = [...transaction.inflows, ...transaction.outflows];
              if (allLegs.some(leg => leg.recordId === recordId)) {
                linkedTxs.push(txId);
              }
            }
          }
          
          alreadyUsedRecords.push({
            recordId,
            status: record.status,
            linkedTransactions: linkedTxs
          });
        }
      }
    }
    
    return {
      allClean: alreadyUsedRecords.length === 0,
      alreadyUsedRecords
    };
    
  } catch (error) {
    console.error('Error verifying record status:', error);
    return {
      allClean: false,
      alreadyUsedRecords: []
    };
  }
}

/**
 * SAFEGUARD #3: Validate journal entries are properly balanced
 * 
 * Ensures debits = credits for each transaction posting
 */
export async function validateJournalEntriesBalanced(
  entries: Omit<JournalEntry, 'id'>[]
): Promise<{
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
  errorMessage?: string;
}> {
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  for (const entry of entries) {
    totalDebits += entry.debit_amount;
    totalCredits += entry.credit_amount;
  }
  
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01; // Allow 0.01 rounding error
  
  return {
    isBalanced,
    totalDebits,
    totalCredits,
    difference,
    errorMessage: isBalanced ? undefined : `Journal entries not balanced: Debits ${totalDebits} != Credits ${totalCredits}`
  };
}

/**
 * SAFEGUARD #4: Prevent duplicate record processing across multiple transactions
 * 
 * Ensures same record is never linked to multiple transactions on same date
 */
export async function verifyNoDuplicateRecordProcessing(
  recordIds: string[],
  transactionDate: string
): Promise<{
  isClean: boolean;
  conflicts: {
    recordId: string;
    linkedTransactionIds: string[];
  }[];
}> {
  
  const conflicts: {
    recordId: string;
    linkedTransactionIds: string[];
  }[] = [];
  
  try {
    const transactionsSnapshot = await get(ref(db, 'modern_transactions'));
    if (!transactionsSnapshot.exists()) {
      return { isClean: true, conflicts: [] };
    }
    
    for (const recordId of recordIds) {
      const linkedTxs: string[] = [];
      
      for (const [txId, tx] of Object.entries(transactionsSnapshot.val())) {
        const transaction = tx as Transaction;
        
        // Same date would indicate duplicate processing
        if (transaction.date.substring(0, 10) === transactionDate.substring(0, 10)) {
          const allLegs = [...transaction.inflows, ...transaction.outflows];
          if (allLegs.some(leg => leg.recordId === recordId)) {
            linkedTxs.push(txId);
          }
        }
      }
      
      if (linkedTxs.length > 1) {
        conflicts.push({
          recordId,
          linkedTransactionIds: linkedTxs
        });
      }
    }
    
    return {
      isClean: conflicts.length === 0,
      conflicts
    };
    
  } catch (error) {
    console.error('Error verifying duplicate processing:', error);
    return {
      isClean: false,
      conflicts: []
    };
  }
}

/**
 * SAFEGUARD #5: Post-transaction reconciliation check
 * 
 * Run after transaction is saved to verify no duplicates were created
 */
export async function reconcileTransactionPosting(
  transactionId: string,
  clientId: string
): Promise<ReconciliationReport> {
  
  try {
    // Step 1: Verify journal entries were created
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    if (!journalSnapshot.exists()) {
      return {
        transactionId,
        status: 'error',
        journalEntriesCreated: 0,
        entriesAreBalanced: false,
        totalDebits: 0,
        totalCredits: 0,
        duplicateCount: 0,
        warnings: ['No journal entries found']
      };
    }
    
    const allEntries = journalSnapshot.val();
    const txEntries: JournalEntry[] = [];
    const duplicateCount = new Map<string, number>();
    
    // Find all entries for this transaction
    for (const [entryId, entry] of Object.entries(allEntries)) {
      const jEntry = entry as JournalEntry;
      if (jEntry.description.includes(`Tx #${transactionId}`)) {
        txEntries.push(jEntry);
        
        // Track duplicates using entry hash
        const hash = `${jEntry.date}|${jEntry.debit_account}|${jEntry.credit_account}|${jEntry.amount_usd}`;
        duplicateCount.set(hash, (duplicateCount.get(hash) || 0) + 1);
      }
    }
    
    if (txEntries.length === 0) {
      return {
        transactionId,
        status: 'error',
        journalEntriesCreated: 0,
        entriesAreBalanced: false,
        totalDebits: 0,
        totalCredits: 0,
        duplicateCount: 0,
        warnings: [`No journal entries found for transaction ${transactionId}`]
      };
    }
    
    // Step 2: Check for duplicates
    const duplicatesFound = Array.from(duplicateCount.values()).filter(count => count > 1).length;
    
    // Step 3: Validate balance
    let totalDebits = 0;
    let totalCredits = 0;
    for (const entry of txEntries) {
      totalDebits += entry.debit_amount;
      totalCredits += entry.credit_amount;
    }
    
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    
    // Step 4: Get client balance to verify it was updated
    const balance = await getClientBalance(clientId);
    
    const warnings: string[] = [];
    if (!isBalanced) {
      warnings.push(`Journal entries not balanced: Debits ${totalDebits} != Credits ${totalCredits}`);
    }
    if (duplicatesFound > 0) {
      warnings.push(`Found ${duplicatesFound} duplicate entries`);
    }
    if (!balance.validation.isValid) {
      warnings.push(`Client balance validation failed: ${balance.validation.issues.join(', ')}`);
    }
    
    return {
      transactionId,
      status: duplicatesFound === 0 && isBalanced ? 'verified' : 
              duplicatesFound > 0 ? 'duplicates_found' : 
              !isBalanced ? 'unbalanced' : 'error',
      journalEntriesCreated: txEntries.length,
      entriesAreBalanced: isBalanced,
      totalDebits,
      totalCredits,
      duplicateCount: duplicatesFound,
      warnings
    };
    
  } catch (error) {
    console.error('Error during reconciliation:', error);
    return {
      transactionId,
      status: 'error',
      journalEntriesCreated: 0,
      entriesAreBalanced: false,
      totalDebits: 0,
      totalCredits: 0,
      duplicateCount: 0,
      warnings: [`Reconciliation error: ${error}`]
    };
  }
}

/**
 * Cleanup: Remove duplicate journal entries if found
 */
export async function cleanupDuplicateJournalEntries(
  transactionId: string
): Promise<{
  duplicatesRemoved: number;
  entriesRemaining: number;
}> {
  
  try {
    const journalSnapshot = await get(ref(db, 'journal_entries'));
    if (!journalSnapshot.exists()) {
      return { duplicatesRemoved: 0, entriesRemaining: 0 };
    }
    
    const allEntries = journalSnapshot.val();
    const txEntries = new Map<string, {id: string, entry: JournalEntry}>();
    
    // Group entries by hash
    for (const [entryId, entry] of Object.entries(allEntries)) {
      const jEntry = entry as JournalEntry;
      if (jEntry.description.includes(`Tx #${transactionId}`)) {
        const hash = `${jEntry.date}|${jEntry.debit_account}|${jEntry.credit_account}|${jEntry.amount_usd}`;
        
        if (!txEntries.has(hash)) {
          txEntries.set(hash, { id: entryId, entry: jEntry });
        } else {
          // Duplicate found - mark for deletion
          console.warn(`Duplicate entry ${entryId} for Tx #${transactionId}`);
        }
      }
    }
    
    // Keep only first occurrence of each unique entry
    const entriesToKeep = new Set(Array.from(txEntries.values()).map(e => e.id));
    const updates: {[key: string]: any} = {};
    let duplicatesRemoved = 0;
    
    for (const [entryId, entry] of Object.entries(allEntries)) {
      const jEntry = entry as JournalEntry;
      if (jEntry.description.includes(`Tx #${transactionId}`) && !entriesToKeep.has(entryId)) {
        updates[`/journal_entries/${entryId}`] = null; // Delete
        duplicatesRemoved++;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
    }
    
    return {
      duplicatesRemoved,
      entriesRemaining: txEntries.size
    };
    
  } catch (error) {
    console.error('Error cleaning up duplicates:', error);
    return { duplicatesRemoved: 0, entriesRemaining: 0 };
  }
}
