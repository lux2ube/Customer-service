

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, query, orderByChild, limitToLast, equalTo } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, SmsEndpoint, NameMatchingRule, CashRecord, FiatRate, SmsParsingRule, Transaction, ClientServiceProvider, JournalEntry } from '../types';
import { normalizeArabic } from '../utils';
import { parseSmsWithAi } from '@/ai/flows/parse-sms-flow';
import { sendTelegramNotification } from './helpers';
import { format } from 'date-fns';
import { getNextSequentialId, stripUndefined } from './helpers';
import { parseSmsWithCustomRules } from '../custom-sms-parser';


// --- SMS Processing Actions ---
export type ProcessSmsState = { message?: string; error?: boolean; } | undefined;
export type MatchSmsState = { message?: string; error?: boolean; } | undefined;
export type BulkUpdateState = { message?: string; error?:boolean; } | undefined;

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
    
    try {
        const fiatRatesSnapshot = await get(query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1)));
        
        const [
            incomingSnapshot,
            endpointsSnapshot,
            accountsSnapshot,
            rulesSnapshot,
            settingsSnapshot
        ] = await Promise.all([
            get(incomingSmsRef),
            get(smsEndpointsRef),
            get(chartOfAccountsRef),
            get(rulesRef),
            get(ref(db, 'settings/api')),
        ]);

        if (!incomingSnapshot.exists()) {
            return { message: "No new SMS messages to process.", error: false };
        }
        
        const allIncoming = incomingSnapshot.val();
        const allEndpoints: Record<string, SmsEndpoint> = endpointsSnapshot.val() || {};
        const allChartOfAccounts: Record<string, Account> = accountsSnapshot.val() || {};
        const customRules: SmsParsingRule[] = rulesSnapshot.exists() ? Object.values(rulesSnapshot.val()) : [];
        const apiSettings: Settings = settingsSnapshot.val() || {};
        
        let currentFiatRates: Record<string, FiatRate> = {};
        if (fiatRatesSnapshot.exists()) {
            const lastEntryKey = Object.keys(fiatRatesSnapshot.val())[0];
            const lastEntry = fiatRatesSnapshot.val()[lastEntryKey];
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
            
            let parsed = parseSmsWithCustomRules(trimmedSmsBody, customRules);
            
            // If custom rules fail, fall back to AI
            if (!parsed && apiSettings.gemini_api_key) {
                parsed = await parseSmsWithAi(trimmedSmsBody, apiSettings.gemini_api_key);
            }
            
            if (parsed && parsed.amount) {
                successCount++;
                
                let amountusd = 0;
                const currencyCode = account.currency;
                const rateInfo = currentFiatRates[currencyCode];

                if (currencyCode === 'USD') {
                    amountusd = parsed.amount;
                } else if (rateInfo) {
                    const rate = (parsed.type === 'credit' ? rateInfo.clientBuy : rateInfo.clientSell) || 0;
                    if (rate > 0) {
                        amountusd = parsed.amount / rate;
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
                    amountusd: parseFloat(amountusd.toFixed(2)),
                    notes: trimmedSmsBody, // Store original SMS in notes
                    rawSms: trimmedSmsBody, // And in its own field
                    createdAt: new Date().toISOString(),
                };
                updates[`/cash_records/${newRecordId}`] = stripUndefined(newRecord);
                recentSmsBodies.add(trimmedSmsBody);
            } else {
                failedCount++;
                const failureRef = push(ref(db, `sms_parsing_failures`));
                // **CRITICAL FIX**: Check if failureRef is not null before using its path
                if (failureRef.key) {
                    updates[`/sms_parsing_failures/${failureRef.key}`] = {
                        rawSms: trimmedSmsBody,
                        accountId,
                        accountName: account.name,
                        failedAt: new Date().toISOString(),
                    };
                } else {
                    console.error("Failed to generate a key for parsing failure log.");
                }
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
        
        revalidatePath('/modern-cash-records');
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

export async function linkSmsToClient(recordId: string, clientId: string) {
    if (!recordId || !clientId) {
        return { success: false, message: "Record ID and Client ID are required." };
    }

    try {
        const [recordSnapshot, clientSnapshot] = await Promise.all([
            get(ref(db, `cash_records/${recordId}`)),
            get(ref(db, `clients/${clientId}`))
        ]);

        if (!recordSnapshot.exists()) return { success: false, message: "Record not found." };
        if (!clientSnapshot.exists()) return { success: false, message: "Client not found." };
        
        const client = clientSnapshot.val() as Client;
        const record = recordSnapshot.val() as CashRecord;

        const updates: { [key: string]: any } = {};
        updates[`/cash_records/${recordId}/clientId`] = clientId;
        updates[`/cash_records/${recordId}/clientName`] = client.name;
        updates[`/cash_records/${recordId}/status`] = 'Matched';

        // --- Create Journal Entry on Match ---
        const journalRef = push(ref(db, 'journal_entries'));
        const clientAccountId = `6000${clientId}`;
        const journalEntry: Omit<JournalEntry, 'id'> = {
            date: new Date().toISOString(),
            description: `Matched SMS Record #${recordId} to ${client.name}`,
            debit_account: '7000', // Unmatched Funds
            credit_account: clientAccountId,
            debit_amount: record.amount,
            credit_amount: record.amount,
            amount_usd: record.amountusd,
            createdAt: new Date().toISOString(),
            debit_account_name: 'Unmatched Funds',
            credit_account_name: client.name,
        };
        updates[`/journal_entries/${journalRef.key}`] = journalEntry;

        await update(ref(db), updates);
        
        // --- Send Telegram Notification ---
        const amountFormatted = `${record.amount.toLocaleString()} ${record.currency}`;
        const usdFormatted = `($${record.amountusd.toFixed(2)} USD)`;
        const flowDirection = record.type === 'inflow' ? 'from' : 'to';
        const person = record.senderName || record.recipientName;
        
        const message = `
✅ *SMS Matched to Client*

*Client:* ${client.name} (\`${clientId}\`)
*Transaction:* ${record.type === 'inflow' ? 'INFLOW' : 'OUTFLOW'} of *${amountFormatted}* ${usdFormatted}
*${record.type === 'inflow' ? 'Sender' : 'Recipient'}:* ${person}
*Original SMS:*
\`\`\`
${record.rawSms}
\`\`\`
        `;

        await sendTelegramNotification(message, "-1002700770095");

        revalidatePath('/modern-cash-records');
        revalidatePath('/cash-receipts');
        revalidatePath('/sms/match');
        return { success: true, message: "SMS record linked to client." };
    } catch (e: any) {
        console.error("Error linking SMS to client:", e);
        return { success: false, message: e.message || "An unexpected database error occurred." };
    }
}

// --- Matching Algorithm Helpers ---
function normalizePhoneNumber(phone: string): string | null {
    if (!phone) return null;
    // Remove all non-digit characters to get the core numbers
    const digitsOnly = phone.replace(/\D/g, '');
    
    // Check if the number is a valid length for a Yemeni number, with or without country code/leading zero
    if (digitsOnly.length >= 9) {
        // Return the last 9 digits to standardize the format
        return digitsOnly.slice(-9);
    }
    
    return null; // Return null if it's not a recognizable phone number format
}

const findClientByPhoneNumber = (personName: string, allClients: Client[]): Client[] => {
    // 1. Normalize the phone number from the SMS text.
    const smsPhoneNumber = normalizePhoneNumber(personName);
    if (!smsPhoneNumber) return [];

    // 2. Find clients whose normalized phone number matches.
    return allClients.filter(c => {
        if (!c.phone) return false;
        // Ensure c.phone is always an array before trying to use .some()
        const clientPhones = Array.isArray(c.phone) ? c.phone : [c.phone];
        return clientPhones.some(p => normalizePhoneNumber(p) === smsPhoneNumber);
    });
};


const findClientByFirstNameAndSecondName = (personName: string, allClients: Client[]): Client[] => {
    const normalizedSmsName = normalizeArabic(personName);
    return allClients.filter(c => {
        const normalizedClientName = normalizeArabic(c.name);
        return normalizedClientName.startsWith(normalizedSmsName);
    });
};

const findClientByFullName = (personName: string, allClients: Client[]): Client[] => {
    const normalizedSmsName = normalizeArabic(personName);
    return allClients.filter(c => normalizeArabic(c.name) === normalizedSmsName);
};

const findClientByFirstNameAndLastName = (personName: string, allClients: Client[]): Client[] => {
    const smsNameParts = normalizeArabic(personName.trim()).split(' ').filter(p => p);
    if (smsNameParts.length < 2) return [];
    const smsFirst = smsNameParts[0];
    const smsLast = smsNameParts[smsNameParts.length - 1];

    return allClients.filter(c => {
        if (!c.name) return false;
        const clientNameParts = normalizeArabic(c.name.trim()).split(' ').filter(p => p);
        if (clientNameParts.length < 2) return false;
        
        const clientFirst = clientNameParts[0];
        const clientLast = clientNameParts[clientNameParts.length - 1];
        
        return smsFirst === clientFirst && smsLast === clientLast;
    });
};

const filterCandidatesByHistory = (
    candidates: Client[],
    record: CashRecord,
    allTransactions: Transaction[]
): Client[] => {
    if (candidates.length <= 1) return candidates;

    // 1. Filter by used same bank account
    const candidatesWhoUsedAccount = candidates.filter(c =>
        c.serviceProviders?.some(sp => sp.providerType === 'Bank' && sp.details['Account ID'] === record.accountId)
    );
    if (candidatesWhoUsedAccount.length === 1) return candidatesWhoUsedAccount;
    if (candidatesWhoUsedAccount.length > 1) candidates = candidatesWhoUsedAccount;

    // 2. Filter by similar transaction amount
    const recordUsdAmount = record.amountusd;
    const candidatesWithSimilarTx = candidates.filter(c =>
        allTransactions.some(tx =>
            tx.clientId === c.id &&
            tx.summary && // Ensure summary exists
            typeof tx.summary.total_inflow_usd === 'number' &&
            Math.abs((tx.summary.total_inflow_usd || 0) - recordUsdAmount) < (recordUsdAmount * 0.1) // 10% tolerance
        )
    );
    if (candidatesWithSimilarTx.length === 1) return candidatesWithSimilarTx;
    if (candidatesWithSimilarTx.length > 1) candidates = candidatesWithSimilarTx;

    // 3. Filter by most recent transaction
    let mostRecentClient: Client | null = null;
    let mostRecentDate = new Date(0);

    for (const client of candidates) {
        const clientTxs = allTransactions.filter(tx => tx.clientId === client.id);
        if (clientTxs.length > 0) {
            const lastTxDate = clientTxs.reduce((latest, tx) => {
                const txDate = new Date(tx.date);
                return txDate > latest ? txDate : latest;
            }, new Date(0));

            if (lastTxDate > mostRecentDate) {
                mostRecentDate = lastTxDate;
                mostRecentClient = client;
            }
        }
    }
    if (mostRecentClient) return [mostRecentClient];

    return candidates; // Return the filtered (or original) list if no single best match is found
};


export async function matchSmsToClients(prevState: MatchSmsState, formData: FormData): Promise<MatchSmsState> {
    try {
        const [clientsSnapshot, smsRecordsSnapshot, endpointsSnapshot, transactionsSnapshot] = await Promise.all([
            get(ref(db, 'clients')),
            get(query(ref(db, 'cash_records'), orderByChild('status'), equalTo('Pending'))),
            get(ref(db, 'sms_endpoints')),
            get(ref(db, 'transactions'))
        ]);

        if (!smsRecordsSnapshot.exists()) return { message: 'No pending SMS records to match.', error: false };

        const allClients: Client[] = clientsSnapshot.exists() ? Object.keys(clientsSnapshot.val()).map(key => ({ id: key, ...clientsSnapshot.val()[key] })) : [];
        const allEndpoints: Record<string, SmsEndpoint> = endpointsSnapshot.exists() ? endpointsSnapshot.val() : {};
        const allTransactions: Transaction[] = transactionsSnapshot.exists() ? Object.values(transactionsSnapshot.val()) : [];

        const smsRecords = Object.entries<CashRecord>(smsRecordsSnapshot.val())
            .map(([id, record]) => ({ id, ...record }))
            .filter(record => record.source === 'SMS' && !record.clientId);

        let matchedCount = 0;
        const updates: { [key: string]: any } = {};

        const ruleFunctions: Record<NameMatchingRule, (name: string, clients: Client[]) => Client[]> = {
            'phone_number': findClientByPhoneNumber,
            'first_and_second': findClientByFirstNameAndSecondName,
            'full_name': findClientByFullName,
            'first_and_last': findClientByFirstNameAndLastName,
            'part_of_full_name': findClientByFirstNameAndSecondName // Using this as a proxy for part of name
        };

        const ruleOrder: NameMatchingRule[] = ['phone_number', 'first_and_second', 'full_name', 'first_and_last', 'part_of_full_name'];

        for (const record of smsRecords) {
            const personName = record.senderName || record.recipientName;
            if (!personName) continue;

            const endpoint = Object.values(allEndpoints).find(ep => ep.accountId === record.accountId);
            const rulesToApply = endpoint?.nameMatchingRules || ruleOrder;

            let bestMatch: Client | null = null;

            for (const rule of rulesToApply) {
                const matchingFunction = ruleFunctions[rule];
                if (!matchingFunction) continue;

                let candidates = matchingFunction(personName, allClients);
                if (candidates.length === 1) {
                    bestMatch = candidates[0];
                    break;
                } else if (candidates.length > 1) {
                    const filteredCandidates = filterCandidatesByHistory(candidates, record, allTransactions);
                    if (filteredCandidates.length === 1) {
                        bestMatch = filteredCandidates[0];
                        break;
                    }
                }
            }

            if (bestMatch) {
                updates[`/cash_records/${record.id}/clientId`] = bestMatch.id;
                updates[`/cash_records/${record.id}/clientName`] = bestMatch.name;
                updates[`/cash_records/${record.id}/status`] = 'Matched';
                matchedCount++;
            }
        }

        if (matchedCount > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/modern-cash-records');
        revalidatePath('/sms/match');
        return { message: `Auto-matching complete. Matched ${matchedCount} records.`, error: false };

    } catch (e: any) {
        console.error("SMS Auto-matching Error:", e);
        return { message: e.message || 'An unknown error occurred.', error: true };
    }
}



export async function updateSmsTransactionStatus(recordId: string, status: 'Used' | 'Cancelled') {
     if (!recordId || !status) {
        return { success: false, message: "Record ID and status are required." };
    }
     try {
        await update(ref(db, `cash_records/${recordId}`), { status });
        revalidatePath('/modern-cash-records');
        revalidatePath('/cash-receipts');
        return { success: true };
     } catch (e: any) {
         console.error("Error updating SMS status:", e);
        return { success: false, message: e.message || "An unexpected database error occurred." };
     }
}

export async function updateBulkSmsStatus(prevState: BulkUpdateState, formData: FormData): Promise<BulkUpdateState> {
    const smsIds = formData.getAll('smsIds') as string[];
    const status = formData.get('status') as string;

    if (!smsIds || smsIds.length === 0 || !status) {
        return { error: true, message: 'No records or status provided for bulk update.' };
    }

    try {
        const updates: { [key: string]: any } = {};
        for (const id of smsIds) {
            updates[`/cash_records/${id}/status`] = status;
        }

        await update(ref(db), updates);
        revalidatePath('/modern-cash-records');
        revalidatePath('/cash-receipts');
        return { message: `${smsIds.length} record(s) updated to "${status}".` };
    } catch (e: any) {
        console.error("Bulk SMS Update Error:", e);
        return { error: true, message: e.message || 'An unknown database error occurred.' };
    }
}

export type ParsingRuleFormState = {
  errors?: {
    name?: string[];
    type?: string[];
    amountStartsAfter?: string[];
    amountEndsBefore?: string[];
    personStartsAfter?: string[];
    personEndsBefore?: string[];
  };
  message?: string;
} | undefined;


const SmsParsingRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required.'),
  type: z.enum(['credit', 'debit']),
  amountStartsAfter: z.string().min(1, 'This marker is required.'),
  amountEndsBefore: z.string().min(1, 'This marker is required.'),
  personStartsAfter: z.string().min(1, 'This marker is required.'),
  personEndsBefore: z.string().optional(), // This one is optional
});


export async function createSmsParsingRule(prevState: ParsingRuleFormState, formData: FormData): Promise<ParsingRuleFormState> {
    const validatedFields = SmsParsingRuleSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Failed to save rule. Please check the fields.',
        };
    }
    
    try {
        const newRuleRef = push(ref(db, 'sms_parsing_rules'));
        await set(newRuleRef, {
            ...validatedFields.data,
            createdAt: new Date().toISOString(),
        });
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to save parsing rule.' };
    }
}

export async function deleteSmsParsingRule(id: string): Promise<{ message?: string }> {
    if (!id) {
        return { message: 'Invalid rule ID.' };
    }
    try {
        await remove(ref(db, `sms_parsing_rules/${id}`));
        revalidatePath('/sms/parsing');
        return {};
    } catch (error) {
        return { message: 'Database error: Failed to delete rule.' };
    }
}

    
