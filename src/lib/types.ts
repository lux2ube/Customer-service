export type AccountType = 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';

export interface Account {
    id: string; // e.g. "101"
    name: string; // e.g. "Cash - YER"
    type: AccountType;
    isGroup: boolean; // To identify group headers
    balance?: number; // Will be calculated
}

export interface JournalEntry {
    id: string;
    date: string;
    description: string;
    debit_account: string; // Account ID
    credit_account: string; // Account ID
    amount: number;
    currency: 'YER' | 'USD' | 'SAR' | 'USDT';
    exchange_rate?: number;
    usd_value?: number;
    fee_usd?: number;
    usdt_amount?: number;
    status: 'pending' | 'confirmed' | 'cancelled' | 'flagged';
    flags?: ('AML' | 'KYC' | 'Manual Review')[];
    hash?: string;
    wallet_address?: string;
    attachment_url?: string;
    added_by?: string;
    createdAt: string; // Internal timestamp
}
