

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update, get } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';
import { findClientByAddress } from './client';
import { sendTelegramNotification, getNextSequentialId, stripUndefined } from './helpers';
import type { JournalEntry, Account, ModernUsdtRecord, UsdtRecord, Client } from '../types';


const USDT_CONTRACT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
const USDT_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address to, uint amount) returns (bool)",
];

export type WalletDetailsState = {
    loading: boolean;
    error?: string;
    address?: string;
    usdtBalance?: string;
    bnbBalance?: string;
};

export type SendRequestState = {
    success?: boolean;
    error?: boolean;
    message?: string;
    newRecordId?: string; // Add this to return the new record ID
    errors?: {
        recipientAddress?: string[];
        amount?: string[];
        creditAccountId?: string[];
    };
};

const SendRequestSchema = z.object({
    recipientAddress: z.string().refine(val => ethers.isAddress(val), {
        message: 'Invalid BSC wallet address.',
    }),
    amount: z.coerce.number().gt(0, {
        message: 'Amount must be greater than zero.',
    }),
    creditAccountId: z.string().min(1, 'A recording account must be selected.'),
    clientId: z.string().min(1, "Client ID is missing."),
    isNewAddress: z.string().transform(val => val === 'true').optional(),
    serviceProviderId: z.string().optional(),
});

function getRpcUrl() {
    const rpcUrl = process.env.BSC_RPC_URL;
    if (!rpcUrl) {
        throw new Error("BSC_RPC_URL is not set in environment variables.");
    }
    return rpcUrl;
}

export async function getWalletDetails(): Promise<WalletDetailsState> {
    const mnemonic = process.env.TRUST_WALLET_MNEMONIC;
    
    if (!mnemonic) {
        return { loading: false, error: 'Server environment variable for wallet mnemonic is not set.' };
    }
    
    try {
        const rpcUrl = getRpcUrl();
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = ethers.Wallet.fromPhrase(mnemonic);
        const connectedWallet = wallet.connect(provider);
        const address = connectedWallet.address;

        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, provider);

        const [usdtBalanceRaw, bnbBalanceRaw] = await Promise.all([
            usdtContract.balanceOf(address),
            provider.getBalance(address)
        ]);

        const usdtBalance = ethers.formatUnits(usdtBalanceRaw, 18);
        const bnbBalance = ethers.formatEther(bnbBalanceRaw);
        
        return {
            loading: false,
            address,
            usdtBalance: parseFloat(usdtBalance).toFixed(4),
            bnbBalance: parseFloat(bnbBalance).toFixed(6),
        };

    } catch (e: any) {
        console.error("Error getting wallet details:", e);
        return { loading: false, error: e.message || "Failed to fetch wallet details." };
    }
}

function escapeTelegramMarkdown(text: string): string {
  if (!text) return '';
  // Escape characters for MarkdownV2
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return String(text).replace(new RegExp(`[\\${charsToEscape.join('\\')}]`, 'g'), '\\$&');
}

export async function createSendRequest(prevState: SendRequestState, formData: FormData): Promise<SendRequestState> {
    const validatedFields = SendRequestSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return {
            error: true,
            message: 'Invalid data provided.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { recipientAddress, amount, creditAccountId, clientId, isNewAddress, serviceProviderId } = validatedFields.data;
    const mnemonic = process.env.TRUST_WALLET_MNEMONIC;

    if (!mnemonic) {
        return { error: true, message: 'Server environment variable for wallet is not configured.' };
    }
    
    const newRequestRef = push(ref(db, 'send_requests'));
    const requestId = newRequestRef.key;
    if (!requestId) {
        return { error: true, message: 'Could not generate request ID.' };
    }
    
    const updates: {[key: string]: any} = {};
    updates[`/send_requests/${requestId}`] = {
        to: recipientAddress,
        amount: amount,
        status: 'pending',
        timestamp: Date.now(),
        creditAccountId: creditAccountId,
        clientId: clientId,
    };

    await update(ref(db), updates);

    try {
        const rpcUrl = getRpcUrl();
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = ethers.Wallet.fromPhrase(mnemonic);
        const connectedWallet = wallet.connect(provider);
        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, connectedWallet);

        const amountToSend = ethers.parseUnits(amount.toString(), 18);
        
        const balance = await usdtContract.balanceOf(wallet.address);
        if (balance < amountToSend) {
            await update(ref(db, `send_requests/${requestId}`), { status: 'failed', error: 'Insufficient USDT balance.' });
            return { error: true, message: 'Insufficient USDT balance to complete the transaction.' };
        }

        const tx = await usdtContract.transfer(recipientAddress, amountToSend);
        
        await update(ref(db, `send_requests/${requestId}`), { txHash: tx.hash });

        await tx.wait();

        await update(ref(db, `send_requests/${requestId}`), { status: 'sent' });
        
        const clientSnapshot = await get(ref(db, `clients/${clientId}`));
        const client = clientSnapshot.exists() ? { id: clientId, ...clientSnapshot.val() } as Client : null;
        const clientName = client ? client.name : 'Unknown Client';
        
        // Fetch recording account details for denormalization
        const creditAccountSnapshot = await get(ref(db, `accounts/${creditAccountId}`));
        const creditAccountName = creditAccountSnapshot.exists() ? (creditAccountSnapshot.val() as Account).name : creditAccountId;
        
        // Create an outflow record in modern_usdt_records
        const newUsdtRecordId = await getNextSequentialId('usdtRecordId');
        const outflowRecord: Omit<UsdtRecord, 'id'> = {
            date: new Date().toISOString(),
            type: 'outflow',
            source: 'Manual',
            status: 'Confirmed',
            clientId: client ? client.id : null,
            clientName: clientName,
            accountId: creditAccountId,
            accountName: creditAccountName,
            amount: amount,
            txHash: tx.hash,
            clientWalletAddress: recipientAddress,
            notes: 'Sent from Wallet Page',
            createdAt: new Date().toISOString(),
        };
        updates[`/records/usdt/${newUsdtRecordId}`] = stripUndefined(outflowRecord);

        // --- Save new address to client profile if needed ---
        if (isNewAddress && client && serviceProviderId) {
            const serviceProvidersSnapshot = await get(ref(db, `service_providers/${serviceProviderId}`));
            if (serviceProvidersSnapshot.exists()) {
                const providerDetails = serviceProvidersSnapshot.val();
                const existingClientProviders = client.serviceProviders || [];
                const newProviderEntry = {
                    providerId: serviceProviderId,
                    providerName: providerDetails.name,
                    providerType: providerDetails.type,
                    details: { Address: recipientAddress }
                };
                
                // Avoid adding duplicates
                const isAlreadySaved = existingClientProviders.some(p => p.details.Address === recipientAddress && p.providerId === serviceProviderId);
                if (!isAlreadySaved) {
                    updates[`/clients/${clientId}/serviceProviders`] = [...existingClientProviders, newProviderEntry];
                }
            }
        }


        const message = `
✅ *USDT Sent Successfully*

*To Client:* ${escapeTelegramMarkdown(clientName)}
*Address:* \`${recipientAddress}\`
*Amount:* ${escapeTelegramMarkdown(amount.toFixed(2))} USDT
*Tx Link:* [View on BscScan](https://bscscan.com/tx/${tx.hash})
        `;
        await sendTelegramNotification(message);

        // Journal Entry for Auto Payment
        if (client) {
            const clientAccountId = `6000${client.id}`;
            const journalRef = push(ref(db, 'journal_entries'));
            const journalEntry: Omit<JournalEntry, 'id'> = {
                date: new Date().toISOString(),
                description: `Auto USDT Payment to ${clientName} - Tx: ${tx.hash.slice(0, 10)}...`,
                debit_account: clientAccountId,
                credit_account: creditAccountId,
                debit_amount: amount,
                credit_amount: amount,
                amount_usd: amount,
                createdAt: new Date().toISOString(),
                debit_account_name: clientName,
                credit_account_name: creditAccountName
            };
            updates[`/journal_entries/${journalRef.key}`] = journalEntry;
        }

        await update(ref(db), updates);

        revalidatePath('/wallet');
        revalidatePath('/modern-usdt-records');

        return { success: true, message: `Transaction successful! Hash: ${tx.hash}`, newRecordId: newUsdtRecordId };

    } catch (e: any) {
        console.error("Error sending transaction:", e);
        const errorMessage = e.reason || e.message || "An unknown error occurred.";
        await update(ref(db, `send_requests/${requestId}`), { status: 'failed', error: errorMessage });
        
        revalidatePath('/wallet');
        return { error: true, message: `Transaction failed: ${errorMessage}` };
    }
}


export type WalletSettingsState = {
    success?: boolean;
    error?: boolean;
    message?: string;
} | undefined;

const WalletSettingsSchema = z.object({
  defaultRecordingAccountId: z.string().min(1, 'An account must be selected.'),
});

export async function updateWalletSettings(prevState: WalletSettingsState, formData: FormData): Promise<WalletSettingsState> {
    const validatedFields = WalletSettingsSchema.safeParse(Object.fromEntries(formData.entries()));

    if (!validatedFields.success) {
        return { error: true, message: "Invalid data provided." };
    }

    try {
        await set(ref(db, 'settings/wallet/defaultRecordingAccountId'), validatedFields.data.defaultRecordingAccountId);
        revalidatePath('/wallet');
        return { success: true, message: 'Default recording account saved.' };
    } catch (e: any) {
        console.error("Error updating wallet settings:", e);
        return { error: true, message: "Database error: Could not save setting." };
    }
}
