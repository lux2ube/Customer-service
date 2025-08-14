
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, limitToLast } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, ParsedSms, SmsParsingRule, SmsEndpoint, NameMatchingRule, CashRecord, FiatRate } from '../types';
import { parseSmsWithCustomRules } from '../custom-sms-parser';
import { normalizeArabic } from '../utils';
import { parseSmsWithAi } from '@/ai/flows/parse-sms-flow';
import { sendTelegramNotification } from './helpers';
import { format } from 'date-fns';
import { getNextSequentialId, stripUndefined } from './helpers';


// --- SMS Processing Actions ---
export type ProcessSmsState = { message?: string; error?: boolean; } | undefined;
export type MatchSmsState = { message?: string; error?: boolean; } | undefined;

export type SmsEndpointState = { message?: string; error?: boolean; } | undefined;

const SmsEndpointSchema = z.object({
  accountId: z.string().min(1, 'Account selection is required.'),
  nameMatchingRules: z.array(z.string()).optional(),
  endpointId: z.string().optional().nullable(),
});

export async function createSmsEndpoint(prevState: SmsEndpointState, formData: FormData): Promise<SmsEndpointState> {
    const dataToValidate = {
        accountId: formData.get('accountId'),
        nameMatchingRules: formData.getAll('nameMatchingRules'),
        endpointId: formData.get('endpointId'),
    };
    
    const validatedFields = SmsEndpointSchema.safeParse(dataToValidate);

    if (!validatedFields.success) {
        return { message: 'Invalid data provided.', error: true };
    }

    const { accountId, nameMatchingRules, endpointId } = validatedFields.data;

    try {
        const accountSnapshot = await get(ref(db, `accounts/${accountId}`));
        if (!accountSnapshot.exists()) {
            return { message: 'Selected account not found.', error: true };
        }
        const accountName = (accountSnapshot.val() as Account).name;
        
        const endpointData = {
            accountId,
            accountName,
            nameMatchingRules,
        };

        if (endpointId) {
            await update(ref(db, `sms_endpoints/${endpointId}`), endpointData);
        } else {
            const newEndpointRef = push(ref(db, 'sms_endpoints'));
            await set(newEndpointRef, {
                ...endpointData,
                createdAt: new Date().toISOString(),
            });
        }

        revalidatePath('/sms/settings');
        return { message: endpointId ? 'Endpoint updated successfully.' : 'Endpoint created successfully.' };

    } catch (error) {
        console.error('Create/Update SMS Endpoint Error:', error);
        return { message: 'Database Error: Failed to save endpoint.', error: true };
    }
}

export async function deleteSmsEndpoint(endpointId: string): Promise<SmsEndpointState> {
    if (!endpointId) {
        return { message: 'Endpoint ID is required.', error: true };
    }
    try {
        await remove(ref(db, `sms_endpoints/${endpointId}`));
        revalidatePath('/sms/settings');
        return { message: 'Endpoint deleted successfully.' };
    } catch (error) {
        console.error('Delete SMS Endpoint Error:', error);
        return { message: 'Database Error: Failed to delete endpoint.', error: true };
    }
}

export async function processIncomingSms(prevState: ProcessSmsState, formData: FormData): Promise<ProcessSmsState> {
    const incomingSmsRef = ref(db, 'incoming');
    const smsEndpointsRef = ref(db, 'sms_endpoints');
    const chartOfAccountsRef = ref(db, 'accounts');
    const rulesRef = ref(db, 'sms_parsing_rules');
    const failuresRef = ref(db, 'sms_parsing_failures');
    const fiatRatesRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));

    try {
        const [
            incomingSnapshot,
            endpointsSnapshot,
            accountsSnapshot,
            rulesSnapshot,
            fiatRatesSnapshot,
        ] = await Promise.all([
            get(incomingSmsRef),
            get(smsEndpointsRef),
            get(chartOfAccountsRef),
            get(rulesRef),
            get(fiatRatesRef),
        ]);

        if (!incomingSnapshot.exists()) {
            return { message: "No new SMS messages to process.", error: false };
        }
        
        const allIncoming = incomingSnapshot.val();
        const allEndpoints: Record<string, SmsEndpoint> = endpointsSnapshot.val() || {};
        const allChartOfAccounts: Record<string, Account> = accountsSnapshot.val() || {};
        const customRules: SmsParsingRule[] = rulesSnapshot.exists() ? Object.values(rulesSnapshot.val()) : [];
        
        let currentFiatRates: Record<string, FiatRate> = {};
        if (fiatRatesSnapshot.exists()) {
            const lastEntry = Object.values(fiatRatesSnapshot.val())[0] as any;
            currentFiatRates = lastEntry.rates || {};
        }
        
        const cashRecordsSnapshot = await get(ref(db, 'cash_records'));
        const allCashRecords: CashRecord[] = cashRecordsSnapshot.exists() ? Object.values(cashRecordsSnapshot.val()) : [];
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentSmsBodies = new Set(
            allCashRecords
                .filter(rec => rec.rawSms && rec.createdAt && new Date(rec.createdAt).getTime() > twentyFourHoursAgo)
                .map(rec => rec.rawSms!.trim())
        );
        
        const updates: { [key: string]: any } = {};
        let processedCount = 0;
        let duplicateCount = 0;
        let successCount = 0;
        let failedCount = 0;

        const processMessageAndUpdate = async (payload: any, endpointId: string, messageId?: string) => {
            const endpointMapping = allEndpoints[endpointId];
            
            if (messageId) {
                updates[`/incoming/${endpointId}/${messageId}`] = null;
            } else {
                 updates[`/incoming/${endpointId}`] = null;
            }

            if (!endpointMapping) return;

            const accountId = endpointMapping.accountId;
            const account = allChartOfAccounts[accountId];
            
            if (!account || !account.currency) return;

            let smsBody: string;
            if (typeof payload === 'object' && payload !== null) {
                smsBody = payload.body || payload.message || payload.text || '';
            } else {
                smsBody = String(payload);
            }
            
            const trimmedSmsBody = smsBody.trim();
            if (trimmedSmsBody === '') return;
            
            if (recentSmsBodies.has(trimmedSmsBody)) {
                duplicateCount++;
                return;
            }

            processedCount++;
            
            let parsed: ParsedSms | null = null;
            
            if (customRules.length > 0) {
                parsed = parseSmsWithCustomRules(trimmedSmsBody, customRules);
            }
            
            if (!parsed) {
                const settings = (await get(ref(db, 'settings'))).val() as Settings;
                if (settings?.api?.gemini_api_key) {
                    parsed = await parseSmsWithAi(trimmedSmsBody, settings.api.gemini_api_key);
                }
            }
            
            if (parsed && parsed.amount) {
                successCount++;
                
                let amountUsd = 0;
                const currencyCode = account.currency;
                const rateInfo = currentFiatRates[currencyCode];

                if (currencyCode === 'USD') {
                    amountUsd = parsed.amount;
                } else if (rateInfo) {
                    // Use a fallback of 0 if rate is not available to prevent crashes
                    const rate = (parsed.type === 'credit' ? rateInfo.clientBuy : rateInfo.clientSell) || 0;
                    if (rate > 0) {
                        amountUsd = parsed.amount / rate;
                    }
                }

                const newRecordId = await getNextSequentialId('cashRecordId');
                const newRecord: Omit<CashRecord, 'id'> = {
                    date: new Date().toISOString(),
                    type: parsed.type === 'credit' ? 'inflow' : 'outflow',
                    source: 'SMS',
                    status: 'Pending',
                    clientId: null,
                    clientName: null,
                    accountId: accountId,
                    accountName: account.name,
                    senderName: parsed.type === 'credit' ? parsed.person : undefined,
                    recipientName: parsed.type === 'debit' ? parsed.person : undefined,
                    amount: parsed.amount!,
                    currency: account.currency!,
                    amountUsd: parseFloat(amountUsd.toFixed(2)),
                    notes: trimmedSmsBody, // Store original SMS in notes
                    rawSms: trimmedSmsBody, // And in its own field
                    createdAt: new Date().toISOString(),
                };
                updates[`/cash_records/${newRecordId}`] = stripUndefined(newRecord);
                recentSmsBodies.add(trimmedSmsBody);
            } else {
                failedCount++;
                const failureRef = push(ref(db, `sms_parsing_failures`));
                updates[failureRef.path.toString()] = {
                    rawSms: trimmedSmsBody,
                    accountId,
                    accountName: account.name,
                    failedAt: new Date().toISOString(),
                };
            }
        };

        for (const endpointId in allIncoming) {
            const messagesNode = allIncoming[endpointId];
            if (typeof messagesNode === 'object' && messagesNode !== null) {
                const messagePromises = Object.keys(messagesNode).map(messageId => 
                    processMessageAndUpdate(messagesNode[messageId], endpointId, messageId)
                );
                await Promise.all(messagePromises);
            } else if (typeof messagesNode === 'string') {
                await processMessageAndUpdate(messagesNode, endpointId);
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
        
        revalidatePath('/cash-records');
        revalidatePath('/sms/parsing-failures');
        let message = `Processed ${processedCount} message(s): ${successCount} successfully parsed, ${failedCount} failed.`;
        if (duplicateCount > 0) {
            message += ` Skipped ${duplicateCount} duplicate message(s).`;
        }
        return { message, error: failedCount > 0 };

    } catch(error: any) {
        console.error("SMS Processing Error:", error);
        return { message: error.message || "An unknown error occurred during SMS processing.", error: true };
    }
}
