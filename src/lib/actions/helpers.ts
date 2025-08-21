

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

export async function sendTelegramNotification(message: string, customChatId?: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    
    // Use the custom chat ID if provided, otherwise fall back to the environment variable.
    const chatId = customChatId || defaultChatId;

    if (!botToken || !chatId) {
        console.error("Telegram bot token or Chat ID is not configured.");
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
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
export async function getNextSequentialId(counterName: 'transactionId' | 'cashRecordId' | 'usdtRecordId' | 'bscApiId'): Promise<string> {
    const counterRef = ref(db, `counters/${counterName}`);
    
    let startValue = 1000;
     if (counterName === 'transactionId') {
        startValue = 0; // Start T-series from 1
    } else if (counterName === 'usdtRecordId' || counterName === 'bscApiId') {
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
        
        let balance = 0;
        if (journalSnapshot.exists()) {
            const allEntries: Record<string, JournalEntry> = journalSnapshot.val();
            for (const key in allEntries) {
                const entry = allEntries[key];
                 if (entry.credit_account === clientAccountId) {
                    balance += entry.amount_usd;
                }
                if (entry.debit_account === clientAccountId) {
                    balance -= entry.amount_usd;
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

        await sendTelegramNotification(message, "-1002700770095");

    } catch (e) {
        console.error("Failed to send transaction notification:", e);
        // Do not block the main operation if notification fails
    }
}
