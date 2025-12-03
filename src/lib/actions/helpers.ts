

import { db } from '../firebase';
import { push, ref, set, runTransaction, get, query, orderByChild, equalTo } from 'firebase/database';
import type { AuditLog, JournalEntry } from '../types';

// Helper to strip undefined values from an object, which Firebase doesn't allow.
export const stripUndefined = (obj: Record<string, any>): Record<string, any> => {
    const newObj: Record<string, any> = {};
    for (const key in obj) {
        // Only include the key if the value is not undefined. Allow null and empty strings.
        if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    }
    return newObj;
};


export async function logAction(
    action: string, 
    entityInfo: { type: AuditLog['entityType'], id: string, name?: string}, 
    details?: Record<string, any> | string
) {
    try {
        const logRef = push(ref(db, 'logs'));
        const logEntry: Omit<AuditLog, 'id'> = {
            timestamp: new Date().toISOString(),
            user: 'system_user', // Replace with actual user info when available
            action: action,
            entityType: entityInfo.type,
            entityId: entityInfo.id,
            entityName: entityInfo.name,
            details: details || {}
        };
        await set(logRef, logEntry);
    } catch (error) {
        console.error("Failed to write to audit log:", error);
        // We typically don't want to fail the main operation if logging fails,
        // but we should be aware of the error.
    }
}


// --- Notification Helper ---

function escapeTelegramMarkdown(text: any): string {
    if (text === null || text === undefined) return '';
    const textStr = String(text);
    // Escape characters for MarkdownV2
    const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
    return textStr.replace(new RegExp(`[\\${charsToEscape.join('\\')}]`, 'g'), '\\$&');
}

export async function sendTelegramNotification(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = "-1002700770095"; // Always use this group chat ID.

    if (!botToken) {
        console.error("TELEGRAM_BOT_TOKEN environment variable is not set.");
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    // The message is pre-escaped before being passed to this function now.
    const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'MarkdownV2',
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        
        const responseData = await response.json();
        if (!response.ok) {
            console.error("Failed to send Telegram text notification:", responseData);
        }

    } catch (error) {
        console.error("Error sending text notification to Telegram:", error);
    }
}

export async function sendTelegramPhoto(photoUrl: string, caption: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.error("Telegram bot token or Chat ID is not configured in environment variables.");
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
    
    const safeCaption = caption.replace(/`/g, "'");

    const payload = {
        chat_id: chatId,
        photo: photoUrl,
        caption: safeCaption,
        parse_mode: 'Markdown',
    };
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const responseData = await response.json();
        if (!response.ok) {
            console.error("Failed to send Telegram photo notification:", responseData);
        }
    } catch (error) {
        console.error("Error sending photo notification to Telegram:", error);
    }
}

// --- Shared Helper for Sequential IDs ---
export async function getNextSequentialId(counterName: 'transactionId' | 'cashRecordId' | 'usdtRecordId' | 'bscApiId' | 'modernUsdtRecordId'): Promise<string> {
    const counterRef = ref(db, `counters/${counterName}`);
    
    let startValue = 1000;
     if (counterName === 'transactionId') {
        startValue = 0; // Start T-series from 1
    } else if (counterName === 'usdtRecordId' || counterName === 'bscApiId' || counterName === 'modernUsdtRecordId') {
        startValue = 0;
    }
    
    const result = await runTransaction(counterRef, (currentValue) => {
        return (currentValue || startValue) + 1;
    });

    if (!result.committed) {
        throw new Error(`Failed to get next sequential ID from counter: ${counterName}.`);
    }

    const idNumber = result.snapshot.val();
    
    // Add prefix for transactions
    if (counterName === 'transactionId') {
        return `T${idNumber}`;
    }
    
    // Add USDT prefix for modern USDT records
    if (counterName === 'modernUsdtRecordId') {
        return `USDT${idNumber}`;
    }
    
    return String(idNumber);
}


// --- Centralized Notification Logic ---
export async function notifyClientTransaction(
    clientId: string,
    clientName: string,
    record: {
        type: 'inflow' | 'outflow';
        amount: number;
        currency: string;
        amountusd: number;
        source: string;
        rawSms?: string;
        senderName?: string;
        recipientName?: string;
    }
) {
    if (!clientId) return;

    try {
        const clientAccountId = `6000${clientId}`;
        const journalQuery = query(ref(db, 'journal_entries'));
        const journalSnapshot = await get(journalQuery);
        
        // Calculate balance using stored_balance = debits - credits convention
        // For liability accounts: debit INCREASES balance, credit DECREASES balance
        let balance = 0;
        if (journalSnapshot.exists()) {
            const allEntries: Record<string, JournalEntry> = journalSnapshot.val();
            for (const key in allEntries) {
                const entry = allEntries[key];
                if (entry.debit_account === clientAccountId) {
                    balance += entry.amount_usd; // Debit increases stored balance
                }
                if (entry.credit_account === clientAccountId) {
                    balance -= entry.amount_usd; // Credit decreases stored balance
                }
            }
        }
        
        const amountFormatted = escapeTelegramMarkdown(`${record.amount.toLocaleString()} ${record.currency}`);
        const usdFormatted = escapeTelegramMarkdown(`($${record.amountusd.toFixed(2)} USD)`);
        const person = escapeTelegramMarkdown(record.senderName || record.recipientName);
        const newBalanceFormatted = escapeTelegramMarkdown(`$${balance.toFixed(2)} USD`);

        let message = `
✅ *${escapeTelegramMarkdown(record.source)} Record Matched/Created*

*Client:* ${escapeTelegramMarkdown(clientName)} \`(${escapeTelegramMarkdown(clientId)})\`
*Transaction:* ${record.type.toUpperCase()} of *${amountFormatted}* ${usdFormatted}
*${record.type === 'inflow' ? 'Sender' : 'Recipient'}:* ${person}
*New Balance:* ${newBalanceFormatted}
        `;
        
        if (record.source === 'SMS' && record.rawSms) {
            message += `
*Original SMS:*
\`\`\`
${escapeTelegramMarkdown(record.rawSms)}
\`\`\`
            `;
        }

        await sendTelegramNotification(message);

    } catch (e) {
        console.error("Failed to send transaction notification:", e);
        // Do not block the main operation if notification fails
    }
}

/**
 * Calculate balance deltas for a journal entry.
 * Returns delta values (positive or negative) to be added to current balances.
 * 
 * PROJECT CONVENTION: Stored balance = DEBITS - CREDITS for ALL accounts.
 * This is NOT traditional accounting - all account types use the same formula.
 * 
 * - For ANY account: DEBIT increases stored balance (+amount)
 * - For ANY account: CREDIT decreases stored balance (-amount)
 * 
 * This means:
 * - Liability accounts (6000-series, 7001, 7002): DEBIT increases balance, CREDIT decreases
 * - Asset accounts: DEBIT increases balance, CREDIT decreases  
 * - The interpretation of what a positive/negative balance means differs by account type,
 *   but the storage formula is consistent.
 */
export function calculateBalanceDeltas(
    debitAccountId: string,
    debitAccountType: string,
    creditAccountId: string,
    creditAccountType: string,
    amount: number
): { debitDelta: number; creditDelta: number } {
    // Project convention: stored balance = debits - credits for ALL accounts
    // The debit account gets +amount (its debit side increases)
    // The credit account gets -amount (its credit side increases, so balance decreases)
    
    const debitDelta = amount;   // Debit always increases stored balance
    const creditDelta = -amount; // Credit always decreases stored balance
    
    return { debitDelta, creditDelta };
}

/**
 * Balance tracker for batch processing.
 * Accumulates deltas during a batch and then generates atomic updates.
 * 
 * IMPORTANT: Only generates balance updates for accounts that actually exist in Firebase.
 * Missing accounts are tracked and can be checked via getMissingAccounts().
 */
export class BalanceTracker {
    private accountBalances: Map<string, { startingBalance: number; delta: number; type: string; exists: boolean }> = new Map();
    private accountsCache: Map<string, any> = new Map();
    private timestamp: string;
    private missingAccounts: Set<string> = new Set();

    constructor(timestamp: string) {
        this.timestamp = timestamp;
    }

    /**
     * Load account data (call once at start of batch to get current balances).
     * Missing accounts are tracked but will NOT have balance updates generated.
     */
    async loadAccounts(accountIds: string[]): Promise<void> {
        const uniqueIds = [...new Set(accountIds)];
        const snapshots = await Promise.all(
            uniqueIds.map(id => get(ref(db, `accounts/${id}`)))
        );
        
        for (let i = 0; i < uniqueIds.length; i++) {
            const accountId = uniqueIds[i];
            if (snapshots[i].exists()) {
                const account = snapshots[i].val();
                this.accountsCache.set(accountId, account);
                this.accountBalances.set(accountId, {
                    startingBalance: account.balance || 0,
                    delta: 0,
                    type: account.type || 'Assets',
                    exists: true
                });
            } else {
                // Track missing account - will NOT generate balance updates
                this.missingAccounts.add(accountId);
                const inferredType = accountId.startsWith('6') || accountId.startsWith('7') ? 'Liabilities' : 'Assets';
                this.accountBalances.set(accountId, {
                    startingBalance: 0,
                    delta: 0,
                    type: inferredType,
                    exists: false
                });
            }
        }
    }

    /**
     * Check if any accounts were missing during load
     */
    getMissingAccounts(): string[] {
        return [...this.missingAccounts];
    }

    /**
     * Validate that all required accounts exist. Throws error if any are missing.
     */
    validateAllAccountsExist(description: string = 'operation'): void {
        if (this.missingAccounts.size > 0) {
            const missing = [...this.missingAccounts].join(', ');
            throw new Error(`Cannot complete ${description}: Missing accounts in chart of accounts: ${missing}. Please create these accounts first.`);
        }
    }

    /**
     * Get account type from cache
     */
    getAccountType(accountId: string): string {
        return this.accountsCache.get(accountId)?.type || 
               (accountId.startsWith('6') || accountId.startsWith('7') ? 'Liabilities' : 'Assets');
    }

    /**
     * Check if a specific account exists
     */
    accountExists(accountId: string): boolean {
        const entry = this.accountBalances.get(accountId);
        return entry?.exists ?? false;
    }

    /**
     * Add a journal entry's effect to the tracker.
     * Only tracks deltas for accounts that exist.
     */
    addJournalEntry(debitAccountId: string, creditAccountId: string, amount: number): void {
        const debitType = this.getAccountType(debitAccountId);
        const creditType = this.getAccountType(creditAccountId);
        
        const { debitDelta, creditDelta } = calculateBalanceDeltas(
            debitAccountId, debitType,
            creditAccountId, creditType,
            amount
        );
        
        // Accumulate deltas only for existing accounts
        const debitEntry = this.accountBalances.get(debitAccountId);
        if (debitEntry && debitEntry.exists) {
            debitEntry.delta += debitDelta;
        }
        
        const creditEntry = this.accountBalances.get(creditAccountId);
        if (creditEntry && creditEntry.exists) {
            creditEntry.delta += creditDelta;
        }
    }

    /**
     * Generate Firebase update paths for all accumulated balance changes.
     * Only includes accounts that actually exist in Firebase.
     */
    getBalanceUpdates(): { [path: string]: any } {
        const updates: { [path: string]: any } = {};
        
        for (const [accountId, entry] of this.accountBalances) {
            // Only generate updates for accounts that exist
            if (entry.exists && entry.delta !== 0) {
                updates[`accounts/${accountId}/balance`] = entry.startingBalance + entry.delta;
                updates[`accounts/${accountId}/lastBalanceUpdate`] = this.timestamp;
            }
        }
        
        return updates;
    }
}

/**
 * Simple single-entry balance update (for non-batch operations).
 * Gets current balances, calculates new values, returns update paths.
 * 
 * PROJECT CONVENTION: stored balance = debits - credits for ALL accounts.
 */
export async function getAccountBalanceUpdates(
    debitAccountId: string,
    creditAccountId: string,
    amount: number,
    timestamp: string
): Promise<{ [path: string]: any }> {
    const updates: { [path: string]: any } = {};
    
    // Get current account data
    const [debitAccountSnapshot, creditAccountSnapshot] = await Promise.all([
        get(ref(db, `accounts/${debitAccountId}`)),
        get(ref(db, `accounts/${creditAccountId}`))
    ]);
    
    const debitAccount = debitAccountSnapshot.exists() ? debitAccountSnapshot.val() : null;
    const creditAccount = creditAccountSnapshot.exists() ? creditAccountSnapshot.val() : null;
    
    if (debitAccount && creditAccount) {
        // Use the unified delta calculation
        const { debitDelta, creditDelta } = calculateBalanceDeltas(
            debitAccountId, debitAccount.type || 'Assets',
            creditAccountId, creditAccount.type || 'Assets',
            amount
        );
        
        const currentDebitBalance = debitAccount.balance || 0;
        const currentCreditBalance = creditAccount.balance || 0;
        
        updates[`accounts/${debitAccountId}/balance`] = currentDebitBalance + debitDelta;
        updates[`accounts/${debitAccountId}/lastBalanceUpdate`] = timestamp;
        updates[`accounts/${creditAccountId}/balance`] = currentCreditBalance + creditDelta;
        updates[`accounts/${creditAccountId}/lastBalanceUpdate`] = timestamp;
    }
    
    return updates;
}

/**
 * Rebuild all account balances from journal entries.
 * Use this for reconciliation or to fix any drift.
 */
export async function rebuildAllAccountBalances(): Promise<{ success: boolean; message: string; accountsUpdated: number }> {
    try {
        const [accountsSnapshot, journalSnapshot] = await Promise.all([
            get(ref(db, 'accounts')),
            get(ref(db, 'journal_entries'))
        ]);
        
        if (!accountsSnapshot.exists()) {
            return { success: false, message: 'No accounts found', accountsUpdated: 0 };
        }
        
        const accounts = accountsSnapshot.val() as Record<string, any>;
        const journalEntries = journalSnapshot.exists() ? journalSnapshot.val() as Record<string, JournalEntry> : {};
        
        // Initialize all balances to 0
        const balances: { [accountId: string]: number } = {};
        for (const accountId in accounts) {
            balances[accountId] = 0;
        }
        
        // Process all journal entries using project convention: stored balance = debits - credits
        for (const entryId in journalEntries) {
            const entry = journalEntries[entryId];
            const debitAccountId = entry.debit_account;
            const creditAccountId = entry.credit_account;
            const amount = entry.amount_usd;
            
            // Project convention: debit increases stored balance, credit decreases
            // This applies uniformly to ALL account types
            if (accounts[debitAccountId]) {
                balances[debitAccountId] = (balances[debitAccountId] || 0) + amount;
            }
            
            if (accounts[creditAccountId]) {
                balances[creditAccountId] = (balances[creditAccountId] || 0) - amount;
            }
        }
        
        // Build atomic updates
        const updates: { [path: string]: any } = {};
        const timestamp = new Date().toISOString();
        let accountsUpdated = 0;
        
        for (const accountId in balances) {
            updates[`accounts/${accountId}/balance`] = balances[accountId];
            updates[`accounts/${accountId}/lastBalanceUpdate`] = timestamp;
            accountsUpdated++;
        }
        
        // Apply all updates atomically
        const { update } = await import('firebase/database');
        await update(ref(db), updates);
        
        return { 
            success: true, 
            message: `Rebuilt balances for ${accountsUpdated} accounts from ${Object.keys(journalEntries).length} journal entries`,
            accountsUpdated 
        };
        
    } catch (error: any) {
        console.error('Failed to rebuild account balances:', error);
        return { success: false, message: error.message || 'Unknown error', accountsUpdated: 0 };
    }
}
