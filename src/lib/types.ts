export type VerificationStatus = 'Active' | 'Inactive' | 'Pending';
export type ReviewFlag = 'AML' | 'Volume' | 'Scam' | 'None' | 'Other';

export interface Client {
    id: string;
    name: string;
    phone: string;
    kyc_type?: 'ID' | 'Passport';
    kyc_document_url?: string;
    verification_status: VerificationStatus;
    review_flags: ReviewFlag[];
    createdAt: string;
}

export interface BankAccount {
    id: string;
    name: string;
    account_number?: string;
    currency: 'YER' | 'USD' | 'SAR';
    status: 'Active' | 'Inactive';
    createdAt: string;
}

export interface CryptoWallet {
    id: string;
    name: string;
    currency: 'USDT';
    address: string;
    createdAt: string;
}


export interface Transaction {
    id: string;
    date: string;
    type: 'Deposit' | 'Withdraw';
    clientId: string;
    clientName?: string; // For display
    bankAccountId?: string;
    bankAccountName?: string; // for display
    cryptoWalletId?: string;
    cryptoWalletName?: string; // for display
    amount: number;
    currency: 'YER' | 'USD' | 'SAR' | 'USDT';
    amount_usd?: number;
    fee_usd?: number;
    amount_usdt?: number;
    attachment_url?: string;
    notes?: string;
    remittance_number?: string;
    hash?: string;
    client_wallet_address?: string;
    status: 'Pending' | 'Confirmed' | 'Cancelled';
    flags: ('AML' | 'KYC' | 'Other')[];
    createdAt: string;
}

export interface Account {
    id: string;
    name: string;
    type: 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';
    isGroup: boolean;
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  currency: 'USD' | 'YER' | 'SAR' | 'USDT';
  createdAt: string;
}

export interface Settings {
    yer_usd: number;
    sar_usd: number;
    usdt_usd: number;
    deposit_fee_percent: number;
    withdraw_fee_fixed: number;
}
