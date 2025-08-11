

import { z } from 'zod';

export interface KycDocument {
    name: string;
    url: string;
    uploadedAt: string;
}

export type VerificationStatus = 'Active' | 'Inactive' | 'Pending';

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
}

export interface ClientActivity {
    id: string;
    date: string;
    type: string;
    description: string;
    amount: number;
    currency: string;
    status: string;
    source: 'Transaction' | 'Cash Receipt' | 'Cash Payment' | 'SMS';
    link?: string;
}

export interface ServiceProvider {
    id: string;
    name: string;
    type: 'Bank' | 'Crypto';
    accountIds: string[];
    createdAt: string;
    // Optional overrides for global settings
    fiatRates?: {
        YER?: { clientBuy: number; clientSell: number; };
        SAR?: { clientBuy: number; clientSell: number; };
    };
    cryptoFees?: {
        buy_fee_percent: number;
        sell_fee_percent: number;
        minimum_buy_fee: number;
        minimum_sell_fee: number;
    };
}


export interface Transaction {
    id: string;
    date: string;
    type: 'Deposit' | 'Withdraw' | 'Modern' | 'Transfer';
    clientId: string;
    clientName?: string; // For display
    bankAccountId?: string;
    bankAccountName?: string; // for display
    cryptoWalletId?: string;
    cryptoWalletName?: string; // for display
    amount?: number;
    currency?: string;
    amount_usd: number;
    fee_usd: number;
    expense_usd?: number;
    amount_usdt: number;
    attachment_url?: string;
    invoice_image_url?: string;
    notes?: string;
    remittance_number?: string;
    hash?: string;
    client_wallet_address?: string;
    status: 'Pending' | 'Confirmed' | 'Cancelled';
    createdAt: string;
    linkedSmsId?: string;
    linkedRecordIds?: string;
    exchange_rate_commission?: number;
}

export interface CashReceipt {
    id: string;
    date: string;
    bankAccountId: string;
    bankAccountName: string;
    clientId: string;
    clientName: string;
    senderName: string;
    amount: number;
    currency: string;
    amountUsd: number;
    remittanceNumber?: string;
    note?: string;
    status: 'Pending' | 'Used' | 'Cancelled';
    createdAt: string;
}

export interface CashPayment {
    id: string;
    date: string;
    bankAccountId: string;
    bankAccountName: string;
    clientId: string;
    clientName: string;
    recipientName: string;
    amount: number;
    currency: string;
    amountUsd: number;
    remittanceNumber?: string;
    note?: string;
    status: 'Confirmed' | 'Cancelled';
    createdAt: string;
    journalEntryId?: string;
}

export interface UsdtManualReceipt {
    id: string;
    date: string;
    clientId: string;
    clientName: string;
    cryptoWalletId: string;
    cryptoWalletName: string;
    amount: number; // USDT amount
    walletAddress?: string;
    txid?: string;
    notes?: string;
    status: 'Completed' | 'Cancelled';
    createdAt: string;
}

export interface UsdtPayment {
    id: string;
    date: string;
    clientId: string;
    clientName: string;
    recipientAddress: string;
    amount: number; // USDT amount
    txid?: string;
    notes?: string;
    status: 'Completed' | 'Cancelled';
    createdAt: string;
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
}

export interface Settings {
    // These are now under /api
    bsc_api_key?: string;
    bsc_wallet_address?: string;
    gemini_api_key?: string;
}

export interface FiatRate {
    currency: string;
    systemBuy: number;
    systemSell: number;
    clientBuy: number;
    clientSell: number;
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
}


export interface BlacklistItem {
    id: string;
    type: 'Name' | 'Phone' | 'Address';
    value: string;
    reason?: string;
    createdAt: string;
}

export interface IncomingSms {
    [pushId: string]: string;
}

export interface SmsTransaction {
    id: string;
    client_name: string; // Name parsed from the SMS
    account_id: string;
    account_name?: string; // for display
    amount: number | null;
    currency: string | null;
    type: 'credit' | 'debit' | null;
    status: 'pending' | 'parsed' | 'matched' | 'used' | 'rejected';
    parsed_at: string;
    raw_sms: string;
    transaction_id?: string; // To store the linked transaction ID
    matched_client_id?: string;
    matched_client_name?: string;
}

// For displaying combined funds in the new transaction form
export type UnifiedReceipt = {
    id: string;
    date: string;
    clientName: string;
    senderName: string;
    bankAccountName: string;
    amount: number;
    currency: string;
    amountUsd: number;
    remittanceNumber?: string;
    source: 'Manual' | 'SMS';
    status: CashReceipt['status'] | SmsTransaction['status'];
    rawSms?: string;
}

export interface UnifiedFinancialRecord {
  id: string;
  date: string;
  type: 'inflow' | 'outflow';
  category: 'fiat' | 'crypto';
  source: 'Manual' | 'SMS' | 'USDT' | 'Cash Payment';
  amount: number;
  currency: string;
  amountUsd: number;
  status: string;
  bankAccountName?: string;
  cryptoWalletName?: string;
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
  entityType: 'client' | 'account' | 'service_provider' | 'bank_account' | 'usdt_receipt' | 'usdt_payment' | 'transaction';
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
}

export interface TransactionFlag {
  id: string;
  name: string;
  color: string;
  description?: string;
}
