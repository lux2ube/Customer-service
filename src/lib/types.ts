export interface Client {
    id: string;
    name: string;
    phone: string;
    kycDocumentUrl?: string;
    verificationStatus: 'Active' | 'Inactive';
    reviewFlags: {
        aml: boolean;
        volume: boolean;
        scam: boolean;
    };
    created_at: string;
    avatarUrl: string;
    walletAddress?: string;
}

export interface BankAccount {
    id: string;
    name: string;
    currency: 'YER' | 'USD' | 'SAR';
}

export interface CryptoWallet {
    id: string;
    name: string;
    address: string;
}

export interface Transaction {
    id: string;
    transactionDate: string;
    type: 'Deposit' | 'Withdraw';
    clientId: string;
    clientName: string; // Denormalized for easy display
    bankAccountId?: string;
    amount: number;
    currency?: 'YER' | 'USD' | 'SAR'; // Denormalized from bank account
    cryptoWalletId?: string;
    usdtAmount?: number;
    exchangeRate?: number;
    fee?: number;
    transactionImageUrl?: string;
    notes?: string;

    remittanceNumber?: string;
    cryptoHash?: string;
    clientWalletAddress?: string;
    status: 'Pending' | 'Confirmed' | 'Cancelled';
    reviewFlags?: {
        aml: boolean;
        kyc: boolean;
        other: boolean;
    };
    createdAt: string; // Internal timestamp for sorting
}
