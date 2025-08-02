
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';
import { findClientByAddress } from './client';

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
    errors?: {
        recipientAddress?: string[];
        amount?: string[];
    };
};

const SendRequestSchema = z.object({
    recipientAddress: z.string().refine(val => ethers.isAddress(val), {
        message: 'Invalid BSC wallet address.',
    }),
    amount: z.coerce.number().gt(0, {
        message: 'Amount must be greater than zero.',
    }),
});

export async function getWalletDetails(): Promise<WalletDetailsState> {
    const mnemonic = process.env.TRUST_WALLET_MNEMONIC;
    const rpcUrl = process.env.ANKR_HTTPS_ENDPOINT;

    if (!mnemonic || !rpcUrl) {
        return { loading: false, error: 'Server environment variables for wallet mnemonic or RPC URL are not set.' };
    }

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
        const address = wallet.address;

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

async function sendNotification(message: string) {
    const botUrl = process.env.WHATSAPP_BOT_URL;
    const botToken = process.env.WHATSAPP_BOT_TOKEN;

    if (!botUrl) {
        console.error("WhatsApp bot URL is not configured in environment variables.");
        return;
    }

    // A common pattern is to include the token in the URL or as a Bearer token.
    // This implementation assumes the URL might need the token.
    // Adjust the `payload` structure based on your specific WhatsApp bot API's requirements.
    const fullUrl = botUrl.includes('[TOKEN]') ? botUrl.replace('[TOKEN]', botToken || '') : botUrl;

    const payload = {
        // This is a generic payload. You might need to change this based on your WhatsApp API provider.
        // For example, it might be { to: "...", body: "..." } or similar.
        text: message,
    };

    try {
        await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Some APIs might require an Authorization header, e.g.:
                // 'Authorization': `Bearer ${botToken}`
            },
            body: JSON.stringify(payload),
        });
    } catch (error) {
        console.error("Failed to send WhatsApp notification:", error);
    }
}

export async function createSendRequest(prevState: SendRequestState, formData: FormData): Promise<SendRequestState> {
    const validatedFields = SendRequestSchema.safeParse({
        recipientAddress: formData.get('recipientAddress'),
        amount: formData.get('amount'),
    });

    if (!validatedFields.success) {
        return {
            error: true,
            message: 'Invalid data provided.',
            errors: validatedFields.error.flatten().fieldErrors,
        };
    }
    
    const { recipientAddress, amount } = validatedFields.data;
    const mnemonic = process.env.TRUST_WALLET_MNEMONIC;
    const rpcUrl = process.env.ANKR_HTTPS_ENDPOINT;

    if (!mnemonic || !rpcUrl) {
        return { error: true, message: 'Server environment variables for wallet are not configured.' };
    }

    // Create the initial request in the database
    const newRequestRef = push(ref(db, 'send_requests'));
    const requestId = newRequestRef.key;
    if (!requestId) {
        return { error: true, message: 'Could not generate request ID.' };
    }

    await set(newRequestRef, {
        to: recipientAddress,
        amount: amount,
        status: 'pending',
        timestamp: Date.now(),
    });

    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, wallet);

        const amountToSend = ethers.parseUnits(amount.toString(), 18);
        
        // Check for sufficient balance before sending
        const balance = await usdtContract.balanceOf(wallet.address);
        if (balance < amountToSend) {
            await update(ref(db, `send_requests/${requestId}`), { status: 'failed', error: 'Insufficient USDT balance.' });
            return { error: true, message: 'Insufficient USDT balance to complete the transaction.' };
        }

        const tx = await usdtContract.transfer(recipientAddress, amountToSend);
        
        // Update DB with transaction hash immediately
        await update(ref(db, `send_requests/${requestId}`), { txHash: tx.hash });

        // Wait for the transaction to be mined
        await tx.wait();

        // Update DB with final status
        await update(ref(db, `send_requests/${requestId}`), { status: 'sent' });
        
        // --- Send Notification ---
        const client = await findClientByAddress(recipientAddress);
        const clientName = client ? client.name : 'Unknown Client';
        const message = `
✅ *USDT Sent Successfully*
        
*To Client:* ${clientName}
*Address:* ${recipientAddress}
*Amount:* ${amount.toFixed(2)} USDT
*Tx Hash:* https://bscscan.com/tx/${tx.hash}
        `;
        await sendNotification(message);
        // ---------------------------------

        revalidatePath('/wallet');
        return { success: true, message: `Transaction successful! Hash: ${tx.hash}` };

    } catch (e: any) {
        console.error("Error sending transaction:", e);
        const errorMessage = e.reason || e.message || "An unknown error occurred.";
        // Update DB with failure status
        await update(ref(db, `send_requests/${requestId}`), { status: 'failed', error: errorMessage });
        
        revalidatePath('/wallet');
        return { error: true, message: `Transaction failed: ${errorMessage}` };
    }
}
