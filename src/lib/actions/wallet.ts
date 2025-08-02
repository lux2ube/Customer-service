

'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set, update } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';
import { findClientByAddress } from './client';
import { sendTelegramNotification } from './helpers';


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

function escapeTelegramMarkdown(text: string): string {
  if (!text) return '';
  // Escape characters for MarkdownV2
  const charsToEscape = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'];
  return String(text).replace(new RegExp(`[\\${charsToEscape.join('\\')}]`, 'g'), '\\$&');
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

    if (!mnemonic) {
        return { error: true, message: 'Server environment variable for wallet is not configured.' };
    }
    
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
        const rpcUrl = getRpcUrl();
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
        const usdtContract = new ethers.Contract(USDT_CONTRACT_ADDRESS, USDT_ABI, wallet);

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
        
        const client = await findClientByAddress(recipientAddress);
        const clientName = client ? client.name : 'Unknown Client';
        
        const message = `
✅ *USDT Sent Successfully*

*To Client:* ${escapeTelegramMarkdown(clientName)}
*Address:* \`${recipientAddress}\`
*Amount:* ${escapeTelegramMarkdown(amount.toFixed(2))} USDT
*Tx Link:* [View on BscScan](https://bscscan.com/tx/${tx.hash})
        `;
        await sendTelegramNotification(message);

        revalidatePath('/wallet');
        return { success: true, message: `Transaction successful! Hash: ${tx.hash}` };

    } catch (e: any) {
        console.error("Error sending transaction:", e);
        const errorMessage = e.reason || e.message || "An unknown error occurred.";
        await update(ref(db, `send_requests/${requestId}`), { status: 'failed', error: errorMessage });
        
        revalidatePath('/wallet');
        return { error: true, message: `Transaction failed: ${errorMessage}` };
    }
}
