
'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { push, ref, set } from 'firebase/database';
import { revalidatePath } from 'next/cache';
import { ethers } from 'ethers';

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

    try {
        const newRequestRef = push(ref(db, 'send_requests'));
        await set(newRequestRef, {
            to: recipientAddress,
            amount: amount,
            status: 'pending',
            timestamp: Date.now(),
        });

        revalidatePath('/wallet');
        return { success: true, message: 'Send request created successfully. It will be processed shortly.' };

    } catch (e: any) {
        console.error("Error creating send request:", e);
        return { error: true, message: 'Database error: Could not create send request.' };
    }
}
