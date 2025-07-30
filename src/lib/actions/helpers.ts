

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
