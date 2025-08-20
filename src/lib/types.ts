

import { z } from 'zod';

export interface KycDocument {
    name: string;
    url: string;
    uploadedAt: string;
}

export type VerificationStatus = 'Active' | 'Inactive' | 'Pending';

export interface ClientServiceProvider {
    providerId: string;
    providerName: string;
    providerType: 'Bank' | 'Crypto';
    // Stores key-value pairs based on the provider's formula
    // e.g., { 'Client Name': 'John Doe', 'Phone Number': '555-1234' }
    // or { 'Address': '0x123...' }
    details: Record<string, string>;
}


export interface Client {
    id: string;
    name: string; // The full name of the client
    phone: string[];
    kyc_documents?: KycDocument[];
    verification_status: VerificationStatus;
    review_flags?: string[];
    prioritize_sms_matching?: boolean;
    createdAt: string;
    bep20_addresses?: string[];
    favoriteBankAccountId?: string;
    favoriteBankAccountName?: string;
    serviceProviders?: ClientServiceProvider[];
}

export interface ClientActivity {
    id: string;
    date: string;
    type: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    source: 'Transaction' | 'Cash Record' | 'USDT Record';
    link?: string;
}

export type BankFormulaField = 'Client Name' | 'Phone Number' | 'ID';
export type CryptoFormulaField = 'Address' | 'ID';

export interface ServiceProvider {
    id: string;
    name: string;
    type: 'Bank' | 'Crypto';
    accountIds: string[];
    createdAt: string;
    bankFormula?: BankFormulaField[];
    cryptoFormula?: CryptoFormulaField[];
    // Optional overrides for global settings
    fiatRates?: {
        [currencyCode: string]: { clientBuy: number; clientSell: number; systemBuy: number; systemSell: number; };
    };
    cryptoFees?: {
        buy_fee_percent: number;
        sell_fee_percent: number;
        minimum_buy_fee: number;
        minimum_sell_fee: number;
    };
}

export interface TransactionLeg {
    recordId: string;
    type: 'cash' | 'usdt';
    accountId: string;
    accountName: string;
    amount: number;
    currency: string;
    amount_usd: number;
}

export interface Transaction {
    id: string;
    date: string;
    type: 'Deposit' | 'Withdraw' | 'Transfer';
    clientId: string;
    clientName?: string; // For display
    status: 'Pending' | 'Confirmed' | 'Cancelled';
    notes?: string;
    attachment_url?: string;
    createdAt: string;
    
    inflows: TransactionLeg[];
    outflows: TransactionLeg[];
    
    summary: {
        total_inflow_usd: number;
        total_outflow_usd: number;
        fee_usd: number;
        net_difference_usd: number;
    };
    
    differenceHandling?: 'income' | 'expense';
    incomeAccountId?: string;
    expenseAccountId?: string;
}


export interface CashRecord {
    id: string;
    date: string;
    type: 'inflow' | 'outflow';
    source: 'Manual' | 'SMS';
    status: 'Pending' | 'Matched' | 'Used' | 'Cancelled' | 'Confirmed';
    clientId: string | null;
    clientName: string | null;
    accountId: string;
    accountName: string;
    senderName?: string; // For inflows
    recipientName?: string; // For outflows
    amount: number;
    currency: string;
    amountusd: number;
    notes?: string;
    rawSms?: string;
    createdAt: string;
}

export interface UsdtRecord {
    id: string;
    date: string;
    type: 'inflow' | 'outflow';
    source: 'Manual' | 'BSCScan';
    status: 'Pending' | 'Used' | 'Cancelled' | 'Confirmed';
    clientId: string | null;
    clientName: string | null;
    accountId: string; // The system's internal crypto wallet account ID
    accountName: string; // The system's internal crypto wallet name
    amount: number; // The USDT amount
    notes?: string;
    txHash?: string;
    clientWalletAddress?: string; // The external client wallet address
    createdAt: string;
    blockNumber?: number; // For sync logic
}

export interface UnifiedFinancialRecord {
  id: string;
  date: string;
  type: 'inflow' | 'outflow';
  category: 'fiat' | 'crypto';
  source: 'Manual' | 'SMS' | 'BSCScan';
  amount: number;
  currency: string;
  amount_usd: number;
  status: string;
  bankAccountName?: string; // from CashRecord
  cryptoWalletName?: string; // from UsdtRecord
  senderName?: string;
  recipientName?: string;
  txHash?: string;
  clientWalletAddress?: string;
}

export interface Account {
    id: string;
    name: string;
    type: 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';
    isGroup: boolean;
    parentId?: string | null;
    currency?: string;
    priority?: number;
    // Balance fields will be calculated properties, not stored directly
}

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  debit_account: string; // Account ID
  credit_account: string; // Account ID
  debit_amount: number;
  credit_amount: number;
  amount_usd: number;
  createdAt: string;
  debit_account_name?: string; // For display
  credit_account_name?: string; // For display
  details?: { accountId: string, debit: number, credit: number }[]; // For multi-leg entries
}

export interface Settings {
    // These are now under /api
    gemini_api_key?: string;
}

export interface FiatRate {
    clientBuy: number;
    clientSell: number;
    systemBuy: number;
    systemSell: number;
}

export interface CryptoFee {
    buy_fee_percent: number;
    sell_fee_percent: number;
    minimum_buy_fee: number;
    minimum_sell_fee: number;
}

export interface Currency {
    code: string;
    name: string;
    type: 'fiat' | 'crypto';
    decimals: number;
}


export interface BlacklistItem {
    id: string;
    type: 'Name' | 'Phone' | 'Address';
    value: string;
    reason?: string;
    createdAt: string;
}

export interface ParsedSms {
  parsed: boolean;
  type?: 'credit' | 'debit';
  amount?: number;
  person?: string;
}

export type NameMatchingRule = 'phone_number' | 'first_and_second' | 'first_and_last' | 'full_name' | 'part_of_full_name';

export interface SmsEndpoint {
    id: string;
    accountId: string;
    accountName: string;
    createdAt: string;
    nameMatchingRules?: NameMatchingRule[];
}

export interface SmsParsingRule {
    id: string;
    name: string;
    type: 'credit' | 'debit';
    amountStartsAfter: string;
    amountEndsBefore: string;
    personStartsAfter: string;
    personEndsBefore: string;
    createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string; // For now, can be 'system' or an admin ID
  action: string;
  entityType: 'client' | 'account' | 'service_provider' | 'bank_account' | 'transaction' | 'cash_record' | 'usdt_record' | 'bsc_api';
  entityId: string;
  entityName?: string;
  details?: Record<string, any> | string;
}

export interface SendRequest {
    id: string;
    to: string;
    amount: number;
    status: 'pending' | 'sent' | 'failed';
    timestamp: number;
    txHash?: string;
    error?: string;
    creditAccountId: string;
    clientId: string;
}

export interface TransactionFlag {
  id: string;
  name: string;
  color: string;
  description?: string;
}

export interface BscApiSetting {
    id: string;
    name: string;
    apiKey: string;
    walletAddress: string;
    accountId: string;
    createdAt: string;
    lastSyncedBlock?: number;
}

// Kept for legacy compatibility but new records use the unified types
export interface CashReceipt {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  bankAccountId: string;
  bankAccountName: string;
  amount: number;
  currency: string;
  amount_usd: number;
  remittanceNumber?: string;
  notes?: string;
  createdAt: string;
  status: 'Pending' | 'Used' | 'Cancelled';
}

export interface CashPayment {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  bankAccountId: string;
  bankAccountName: string;
  amount: number;
  currency: string;
  amount_usd: number;
  recipientName: string;
  notes?: string;
  createdAt: string;
  status: 'Pending' | 'Used' | 'Cancelled';
}

export interface ModernUsdtRecord {
    id: string;
    date: string;
    type: 'inflow' | 'outflow';
    source: 'Manual' | 'BSCScan';
    status: 'Pending' | 'Used' | 'Cancelled' | 'Confirmed';
    clientId: string | null;
    clientName: string | null;
    accountId: string;
    accountName: string;
    amount: number;
    notes?: string;
    txHash?: string;
    clientWalletAddress?: string;
    createdAt: string;
}


export interface ModernCashRecord {
    id: string;
    date: string;
    type: 'inflow' | 'outflow';
    source: 'Manual' | 'SMS';
    status: 'Pending' | 'Matched' | 'Used' | 'Cancelled';
    clientId: string | null;
    clientName: string | null;
    accountId: string;
    accountName: string;
    senderName?: string;
    recipientName?: string;
    amount: number;
    currency: string;
    amountusd: number;
    notes?: string;
    rawSms?: string;
    createdAt: string;
}

export interface SmsTransaction {
    id: string;
    date: string;
    type: 'credit' | 'debit';
    amount: number;
    person: string;
    status: 'parsed' | 'matched' | 'used' | 'cancelled';
    rawSms: string;
    matched_client_id?: string;
    matched_client_name?: string;
    createdAt: string;
    transaction_id: string; // The sequential S-number
}
