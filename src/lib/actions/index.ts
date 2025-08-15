

// This file serves as the single entry point for all server actions.
// It re-exports all actions from the domain-specific modules.

// Account Management
export {
    createAccount,
    deleteAccount,
    updateAccountPriority,
    createJournalEntry,
    setupClientParentAccount
} from './account';

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

// External Integrations (BSCScan)
export { 
    syncBscTransactions,
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
    deleteSmsParsingRule
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
    deleteBscSyncedRecords
} from './utility';

// Wallet (Live Sending)
export {
    getWalletDetails,
    createSendRequest,
    updateWalletSettings
} from './wallet';

// Document Processing (OCR)
export {
    processDocument
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
} from './financial-records';
