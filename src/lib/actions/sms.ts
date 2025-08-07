

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get, remove } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import type { Client, Account, Settings, Transaction, SmsTransaction, ParsedSms, SmsParsingRule, SmsEndpoint, NameMatchingRule } from '../types';
import { parseSmsWithCustomRules } from '../custom-sms-parser';
import { normalizeArabic } from '../utils';
import { parseSmsWithAi } from '@/ai/flows/parse-sms-flow';
import { sendTelegramNotification } from './helpers';
import { format } from 'date-fns';


// --- SMS Processing Actions ---
export async function updateSmsTransactionStatus(id: string, status: SmsTransaction['status']): Promise<{success: boolean, message?: string}> {
    if (!id || !status) {
        return { success: false, message: 'Invalid ID or status provided.' };
    }
    try {
        const txRef = ref(db, `sms_transactions/${id}`);
        await update(txRef, { status });
        revalidatePath('/sms/transactions');
        revalidatePath('/cash-receipts');
        return { success: true };
    } catch (error) {
        return { success: false, message: 'Database error: Failed to update status.' };
    }
}

export async function linkSmsToClient(smsId: string, clientId: string): Promise<{ success: boolean, message?: string }> {
    if (!smsId || !clientId) {
        return { success: false, message: 'Invalid SMS ID or Client ID.' };
    }
    try {
        const clientRef = ref(db, `clients/${clientId}`);
        const clientSnapshot = await get(clientRef);
        if (!clientSnapshot.exists()) {
            return { success: false, message: 'Client not found.' };
        }
        const clientName = (clientSnapshot.val() as Client).name;

        const smsTxRef = ref(db, `sms_transactions/${smsId}`);
        const updateData = {
            status: 'matched' as const,
            matched_client_id: clientId,
            matched_client_name: clientName,
        };
        await update(smsTxRef, updateData);
        revalidatePath('/sms/transactions');
        revalidatePath('/cash-receipts');
        return { success: true, message: 'SMS linked to client successfully.' };
    } catch (error) {
        console.error('Error linking SMS to client:', error);
        return { success: false, message: 'Database error while linking.' };
    }
}


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
    const transactionsRef = ref(db, 'sms_transactions');
    const rulesRef = ref(db, 'sms_parsing_rules');

    try {
        const promiseResults = await Promise.all([
            get(incomingSmsRef),
            get(smsEndpointsRef),
            get(chartOfAccountsRef),
            get(transactionsRef),
            get(rulesRef),
        ]);

        const [
            incomingSnapshot,
            endpointsSnapshot,
            accountsSnapshot,
            smsTransactionsSnapshot,
            rulesSnapshot,
        ] = promiseResults;
        

        if (!incomingSnapshot.exists()) {
            return { message: "No new SMS messages to process.", error: false };
        }
        
        const allIncoming = incomingSnapshot.val();
        const allEndpoints: Record<string, SmsEndpoint> = endpointsSnapshot.val() || {};
        const allChartOfAccounts: Record<string, Account> = accountsSnapshot.val() || {};
        const customRules: SmsParsingRule[] = rulesSnapshot.exists() ? Object.values(rulesSnapshot.val()) : [];
        
        const allSmsTransactions: SmsTransaction[] = smsTransactionsSnapshot.exists() ? Object.values(smsTransactionsSnapshot.val()) : [];
        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentSmsBodies = new Set(
            allSmsTransactions
                .filter(tx => tx.raw_sms && tx.parsed_at && new Date(tx.parsed_at).getTime() > twentyFourHoursAgo)
                .map(tx => tx.raw_sms.trim())
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
            const newTxId = push(transactionsRef).key;
            if (!newTxId) return;

            let parsed: ParsedSms | null = null;
            
            if (customRules.length > 0) {
                parsed = parseSmsWithCustomRules(trimmedSmsBody, customRules);
            }
            
            if (!parsed) {
                const settings = (await get(ref(db, 'settings'))).val() as Settings;
                if (settings?.gemini_api_key) {
                    parsed = await parseSmsWithAi(trimmedSmsBody, settings.gemini_api_key);
                }
            }
            
            if (parsed) {
                successCount++;
                updates[`/sms_transactions/${newTxId}`] = {
                    client_name: parsed.person,
                    account_id: accountId,
                    account_name: account.name,
                    amount: parsed.amount,
                    currency: account.currency,
                    type: parsed.type,
                    status: 'parsed',
                    parsed_at: new Date().toISOString(),
                    raw_sms: trimmedSmsBody,
                };
                recentSmsBodies.add(trimmedSmsBody);
            } else {
                failedCount++;
                updates[`/sms_transactions/${newTxId}`] = {
                    client_name: 'Parsing Failed',
                    account_id: accountId,
                    account_name: account.name,
                    amount: null,
                    currency: account.currency,
                    type: null,
                    status: 'rejected',
                    parsed_at: new Date().toISOString(),
                    raw_sms: trimmedSmsBody,
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
        
        revalidatePath('/sms/transactions');
        revalidatePath('/cash-receipts');
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

// --- SMS Matching Algorithm Helpers ---
type ClientWithId = Client & { id: string };

const matchByPhoneNumber = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const smsPhone = smsParsedName.replace(/\D/g, '');
    if (!smsPhone) return [];
    
    return clients.filter(client => {
        const clientPhones = (Array.isArray(client.phone) ? client.phone : [client.phone]).filter(Boolean);
        return clientPhones.some(p => p.replace(/\D/g, '').endsWith(smsPhone));
    });
};

const matchByFirstNameAndSecondName = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const normalizedSmsName = normalizeArabic(smsParsedName.toLowerCase()).trim();
    return clients.filter(client => {
        if (!client.name) return false;
        const normalizedClientName = normalizeArabic(client.name.toLowerCase()).trim();
        const clientNameParts = normalizedClientName.split(' ');
        const smsNameParts = normalizedSmsName.split(' ');
        if (smsNameParts.length !== 2) return false;
        return clientNameParts[0] === smsNameParts[0] && clientNameParts[1] === smsNameParts[1];
    });
};

const matchByFullNameOrPartial = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const normalizedSmsName = normalizeArabic(smsParsedName.toLowerCase()).trim();
    return clients.filter(client => {
        if (!client.name) return false;
        const normalizedClientName = normalizeArabic(client.name.toLowerCase()).trim();
        return normalizedClientName.startsWith(normalizedSmsName);
    });
};

const matchByFirstNameAndLastName = (clients: ClientWithId[], smsParsedName: string): ClientWithId[] => {
    const smsNameParts = normalizeArabic(smsParsedName.toLowerCase()).trim().split(' ');
    if (smsNameParts.length < 2) return [];
    const smsFirst = smsNameParts[0];
    const smsLast = smsNameParts[smsNameParts.length - 1];

    return clients.filter(client => {
        if (!client.name) return false;
        const clientNameParts = normalizeArabic(client.name.toLowerCase()).trim().split(' ');
        if (clientNameParts.length < 2) return false;
        const clientFirst = clientNameParts[0];
        const clientLast = clientNameParts[clientNameParts.length - 1];
        return clientFirst === smsFirst && clientLast === smsLast;
    });
};

const scoreAndSelectBestMatch = (
    matches: ClientWithId[],
    sms: SmsTransaction & { id: string },
    allTransactions: (Transaction & { id: string })[],
): ClientWithId | null => {
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) return null;

    // Prioritized match beats all
    const prioritizedMatch = matches.find(c => c.prioritize_sms_matching);
    if (prioritizedMatch) return prioritizedMatch;

    let scores = matches.map(client => ({
        client,
        score: 0,
        lastUsed: 0
    }));

    // Score based on previous use of bank account
    const clientTxHistory = allTransactions.filter(tx => tx.bankAccountId === sms.account_id && tx.status === 'Confirmed');
    
    scores.forEach(item => {
        const clientTxs = clientTxHistory.filter(tx => tx.clientId === item.client.id);
        if (clientTxs.length > 0) {
            item.score += 10; // High score for using the same bank account
            const lastTx = clientTxs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
            item.lastUsed = new Date(lastTx.date).getTime();
        }
    });

    // Sort by score, then by most recent usage
    scores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.lastUsed - a.lastUsed;
    });

    const bestScore = scores[0].score;
    const topScorers = scores.filter(s => s.score === bestScore);

    if (topScorers.length === 1) {
        return topScorers[0].client;
    }

    // If still tied, no confident match can be made.
    return null;
};

const escapeTelegramMarkdown = (text: string | number | null | undefined): string => {
  if (text === null || text === undefined) return '';
  const textStr = String(text);
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return textStr.replace(new RegExp(`[\\${charsToEscape.join('\\')}]`, 'g'), '\\$&');
};

// --- The main matching algorithm ---
export async function matchSmsToClients(prevState: MatchSmsState, formData: FormData): Promise<MatchSmsState> {
    try {
        const [smsSnapshot, clientsSnapshot, transactionsSnapshot, endpointsSnapshot] = await Promise.all([
            get(ref(db, 'sms_transactions')),
            get(ref(db, 'clients')),
            get(ref(db, 'transactions')),
            get(ref(db, 'sms_endpoints')),
        ]);

        if (!smsSnapshot.exists() || !clientsSnapshot.exists() || !endpointsSnapshot.exists()) {
            return { message: "No SMS, clients, or endpoints found to perform matching.", error: false };
        }

        const allSmsData: Record<string, SmsTransaction> = smsSnapshot.val();
        const allClientsData: Record<string, Client> = clientsSnapshot.val();
        const allTransactionsData: Record<string, Transaction> = transactionsSnapshot.val() || {};
        const allEndpointsData: Record<string, SmsEndpoint> = endpointsSnapshot.val();
        
        const clientsArray: ClientWithId[] = Object.values(allClientsData).map((c, i) => ({ ...c, id: Object.keys(allClientsData)[i] }));
        const transactionsArray: (Transaction & { id: string })[] = Object.values(allTransactionsData).map((t, i) => ({ ...t, id: Object.keys(allTransactionsData)[i] }));

        const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;
        const smsToMatch = Object.entries(allSmsData)
            .map(([id, sms]) => ({ id, ...sms }))
            .filter(sms => sms.status === 'parsed' && new Date(sms.parsed_at).getTime() >= fortyEightHoursAgo);
        
        if (smsToMatch.length === 0) {
            return { message: "No new SMS messages to match.", error: false };
        }
        
        const updates: { [key: string]: any } = {};
        let matchedCount = 0;
        
        const rulePriority: NameMatchingRule[] = ['phone_number', 'first_and_second', 'full_name', 'part_of_full_name', 'first_and_last'];

        for (const sms of smsToMatch) {
            if (!sms.client_name || !sms.account_id) continue;
            
            const endpoint = Object.values(allEndpointsData).find(e => e.accountId === sms.account_id);
            if (!endpoint || !endpoint.nameMatchingRules || endpoint.nameMatchingRules.length === 0) continue;

            const sortedRules = rulePriority.filter(rule => endpoint.nameMatchingRules!.includes(rule));

            let potentialMatches: ClientWithId[] = [];
            
            for (const rule of sortedRules) {
                switch(rule) {
                    case 'phone_number':
                        potentialMatches = matchByPhoneNumber(clientsArray, sms.client_name);
                        break;
                    case 'first_and_second':
                        potentialMatches = matchByFirstNameAndSecondName(clientsArray, sms.client_name);
                        break;
                    case 'full_name':
                    case 'part_of_full_name':
                        potentialMatches = matchByFullNameOrPartial(clientsArray, sms.client_name);
                        break;
                    case 'first_and_last':
                        potentialMatches = matchByFirstNameAndLastName(clientsArray, sms.client_name);
                        break;
                }
                
                if (potentialMatches.length > 0) break; // Stop at the first rule that finds matches
            }
            
            if (potentialMatches.length > 0) {
                const finalMatch = scoreAndSelectBestMatch(potentialMatches, sms, transactionsArray);
                if (finalMatch) {
                    updates[`/sms_transactions/${sms.id}/status`] = 'matched';
                    updates[`/sms_transactions/${sms.id}/matched_client_id`] = finalMatch.id;
                    updates[`/sms_transactions/${sms.id}/matched_client_name`] = finalMatch.name;
                    matchedCount++;
                    
                    // Send notification on successful match
                    const message = `
*إستلام حوالة*
*كوين كاش*
لكم حوالة ${escapeTelegramMarkdown(sms.amount)} ${escapeTelegramMarkdown(sms.currency)}

مقابل حوالة واردة عن طريق: ${escapeTelegramMarkdown(sms.account_name)}
مبلغ الحوالة: ${escapeTelegramMarkdown(sms.amount)}
عملة الحوالة: ${escapeTelegramMarkdown(sms.currency)}
المستلم: ${escapeTelegramMarkdown(sms.account_name)}
المرسل: ${escapeTelegramMarkdown(finalMatch.name)}

رقم الحوالة: \`${sms.id}\`

${escapeTelegramMarkdown(format(new Date(), 'Pp'))}
                    `;
                    await sendTelegramNotification(message);
                }
            }
        }
        
        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/sms/transactions');
        revalidatePath('/cash-receipts');
        return { message: `Matching complete. Successfully matched ${matchedCount} SMS record(s).`, error: false };

     } catch(error: any) {
        console.error("SMS Matching Error:", error);
        return { message: error.message || "An unknown error occurred during matching.", error: true };
    }
}

export type MergeState = {
    message?: string;
    error?: boolean;
    success?: boolean;
    mergedGroups?: {
        primary: Client;
        duplicates: Client[];
    }[];
} | undefined;

export async function mergeDuplicateClients(prevState: MergeState, formData: FormData): Promise<MergeState> {
    try {
        const clientsRef = ref(db, 'clients');
        const clientsSnapshot = await get(clientsRef);

        if (!clientsSnapshot.exists()) {
            return { message: "No clients found to merge.", error: false };
        }

        const clientsData: Record<string, Client> = clientsSnapshot.val();
        
        const clientsByName: Record<string, Client[]> = {};

        for (const clientId in clientsData) {
            const client = { id: clientId, ...clientsData[clientId] };
            if (!client.name) continue;
            const normalizedName = client.name.trim().toLowerCase();
            
            if (!clientsByName[normalizedName]) {
                clientsByName[normalizedName] = [];
            }
            clientsByName[normalizedName].push(client);
        }

        const updates: { [key: string]: any } = {};
        const mergedGroups: { primary: Client, duplicates: Client[] }[] = [];

        for (const name in clientsByName) {
            const group = clientsByName[name];
            if (group.length > 1) {
                group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                
                const primaryClient = group[0];
                const duplicates = group.slice(1);
                
                mergedGroups.push({ primary: primaryClient, duplicates });

                const allPhones = new Set(Array.isArray(primaryClient.phone) ? primaryClient.phone : [primaryClient.phone].filter(Boolean));
                const allKycDocs = new Map(primaryClient.kyc_documents?.map(doc => [doc.url, doc]) || []);
                const allBep20 = new Set(primaryClient.bep20_addresses || []);

                for (const dup of duplicates) {
                    (Array.isArray(dup.phone) ? dup.phone : [dup.phone]).forEach(p => p && allPhones.add(p));
                    (dup.bep20_addresses || []).forEach(a => allBep20.add(a));
                    (dup.kyc_documents || []).forEach(doc => {
                        if (!allKycDocs.has(doc.url)) {
                            allKycDocs.set(doc.url, doc);
                        }
                    });
                    
                    updates[`/clients/${dup.id}`] = null;
                };
                
                updates[`/clients/${primaryClient.id}/phone`] = Array.from(allPhones);
                updates[`/clients/${primaryClient.id}/bep20_addresses`] = Array.from(allBep20);
                updates[`/clients/${primaryClient.id}/kyc_documents`] = Array.from(allKycDocs.values());
            }
        }

        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }

        revalidatePath('/clients/merge');
        revalidatePath('/clients');
        return { 
            message: `Merge complete. Processed ${mergedGroups.length} groups.`, 
            error: false,
            success: true,
            mergedGroups,
        };

    } catch (error: any) {
        console.error("Client Merge Error:", error);
        return { message: error.message || "An unknown error occurred during the merge.", error: true };
    }
}

export type BulkUpdateState = { message?: string; error?: boolean } | undefined;

export async function updateBulkSmsStatus(prevState: BulkUpdateState, formData: FormData): Promise<BulkUpdateState> {
    const smsIds = formData.getAll('smsIds') as string[];
    const status = formData.get('status') as SmsTransaction['status'];

    if (!smsIds || smsIds.length === 0 || !status) {
        return { message: 'No SMS records or status selected.', error: true };
    }

    const updates: { [key: string]: any } = {};
    for (const id of smsIds) {
        updates[`/sms_transactions/${id}/status`] = status;
    }

    try {
        await update(ref(db), updates);
        revalidatePath('/sms/transactions');
        revalidatePath('/cash-receipts');
        return { message: `Successfully updated ${smsIds.length} SMS records to "${status}".`, error: false };
    } catch (error) {
        console.error('Bulk SMS update error:', error);
        return { message: 'Database error: Failed to update SMS records.', error: true };
    }
}
