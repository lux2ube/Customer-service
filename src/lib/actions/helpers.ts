

import { db } from '../firebase';
import { push, ref, set } from 'firebase/database';
import type { AuditLog } from '../types';

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

function escapeTelegramMarkdown(text: string): string {
  if (!text) return '';
  // Escape characters for MarkdownV2
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return String(text).replace(new RegExp(`[\\${charsToEscape.join('\\')}]`, 'g'), '\\$&');
}

export async function sendTelegramNotification(message: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.error("Telegram bot token or Chat ID is not configured in environment variables.");
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
            console.error("Failed to send Telegram notification:", responseData);
        }

    } catch (error) {
        console.error("Error sending notification to Telegram:", error);
    }
}

