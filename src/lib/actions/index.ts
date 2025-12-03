

// This file serves as the single entry point for all server actions.
// It re-exports all actions from the domain-specific modules.

// Account Management
export {
    createAccount,
    deleteAccount,
    updateAccountPriority,
    setupClientParentAccount,
    fixAccount7000,
    rebuildAccountBalances
} from './account';

// Journal Entries
export {
    createJournalEntry,
    createJournalEntryFromTransaction,
} from './journal';

// Client Management
export {
    createClient,
    manageClient,
    searchClients,
    findClientByAddress,
    importClients,
    batchUpdateClientForTransactions,
    migrateBep20Addresses,
} from './client';

export {
    mergeDuplicateClients
} from './client-merge';

// External Integrations (BSCScan)
export { 
    syncBscTransactions,
    syncBscCsv,
    type SyncState,
} from './integration';

export {
    createBscApiSetting,
    deleteBscApiSetting,
    migrateExistingBscApi
} from './bsc';


// SMS Processing & Management
export {
    createSmsEndpoint,
    deleteSmsEndpoint,
    processIncomingSms,
    linkSmsToClient,
    updateSmsTransactionStatus,
    updateBulkSmsStatus,
    createSmsParsingRule,
    deleteSmsParsingRule,
    matchSmsToClients
} from './sms';

// Core Transaction Logic
export {
    createModernTransaction,
    getUnifiedClientRecords,
    updateBulkTransactions,
} from './transaction';

// Global Settings & Utilities
export {
    updateFiatRates,
    updateCryptoRates,
    updateCryptoFees,
    updateApiSettings,
    addBlacklistItem,
    deleteBlacklistItem,
    scanClientsWithBlacklist,
    addCurrency,
    deleteCurrency,
    initializeDefaultCurrencies,
    deleteAllModernCashRecords,
    deleteBscSyncedRecords,
    backfillCashRecordUsd
} from './utility';

export {
    createLabel,
    deleteLabel
} from './label';

// Wallet (Live Sending)
export {
    getWalletDetails,
    createSendRequest,
    updateWalletSettings,
    type WalletDetailsState,
    type SendRequestState,
} from './wallet';

// Document Processing (OCR)
export {
    processDocument,
    type DocumentParsingState,
} from './document';

// Service Provider Management
export {
    createServiceProvider,
    deleteServiceProvider
} from './service-provider';

// Unified Financial Records (Cash & USDT)
export {
    createCashReceipt,
    createUsdtManualReceipt,
    createUsdtManualPayment,
    cancelCashPayment,
    updateCashRecordStatus,
    updateUsdtRecordStatus,
    assignRecordToClient,
} from './financial-records';

// Balance Management & Helpers
export {
    getAccountBalanceUpdates,
    BalanceTracker,
} from './helpers';
