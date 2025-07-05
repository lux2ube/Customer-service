

export interface KycDocument {
    name: string;
    url: string;
    uploadedAt: string;
}

export type VerificationStatus = 'Active' | 'Inactive' | 'Pending';
export type ReviewFlag = 'AML' | 'Volume' | 'Scam' | 'None' | 'Other' | 'Blacklisted';

export interface Client {
    id: string;
    name: string; // The full name of the client
    phone: string;
    kyc_documents?: KycDocument[];
    verification_status: VerificationStatus;
    review_flags: ReviewFlag[];
    createdAt: string;
    bep20_addresses?: string[];
    favoriteBankAccountId?: string;
    favoriteBankAccountName?: string;
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
    amount_usd: number;
    fee_usd: number;
    expense_usd?: number;
    amount_usdt: number;
    attachment_url?: string;
    notes?: string;
    remittance_number?: string;
    hash?: string;
    client_wallet_address?: string;
    status: 'Pending' | 'Confirmed' | 'Cancelled';
    flags: ('AML' | 'KYC' | 'Other' | 'Blacklisted')[];
    createdAt: string;
}

export interface Account {
    id: string;
    name: string;
    type: 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';
    isGroup: boolean;
    parentId?: string | null;
    currency?: 'YER' | 'USD' | 'SAR' | 'USDT';
    // Balance fields will be calculated properties, not stored directly
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  debit_account: string; // Account ID
  credit_account: string; // Account ID
  debit_amount: number;
  debit_currency: string;
  credit_amount: number;
  credit_currency: string;
  amount_usd: number;
  createdAt: string;
  debit_account_name?: string; // For display
  credit_account_name?: string; // For display
}

export interface Settings {
    yer_usd: number;
    sar_usd: number;
    usdt_usd: number;
    deposit_fee_percent: number;
    withdraw_fee_percent: number;
    minimum_fee_usd: number;
    bsc_api_key?: string;
    bsc_wallet_address?: string;
}

export interface BlacklistItem {
    id: string;
    type: 'Name' | 'Phone' | 'Address';
    value: string;
    reason?: string;
    createdAt: string;
}
