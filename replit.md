# Customer Central - Financial Transaction Management System

## Overview

Customer Central is a comprehensive financial transaction management system built with Next.js and Firebase. The application manages customer profiles, cash and cryptocurrency (USDT) transactions, and implements double-entry accounting principles. It features SMS parsing with AI, automated transaction processing, and multi-currency support (YER, SAR, USDT).

The system is designed to handle financial operations for a currency exchange business, tracking both fiat currency movements and cryptocurrency transactions while maintaining a complete audit trail through journal entries.

## Recent Changes

### November 29, 2025 - Complete API-Based CSV Sync (No Server Actions)
- **Completely Redesigned CSV Sync**: Replaced server action with pure API + client-side processing
  - Created `/api/sync-usdt-csv` endpoint for backend batch processing
  - Form component uses **zero server actions** - pure fetch API calls
  - CSV parsing happens in browser (JavaScript, not server)
  - Sends rows in batches of 10 to prevent payload limits
  - Shows progress toast: "Batch X/Y..." for each batch
  - Graceful error handling per batch (if one fails, user knows which batch)
  - Final summary: "X synced, Y skipped"
  - No more "An unexpected response was received from the server" errors
  - Maintains full double-entry accounting with automatic journal entries
  - Client can upload large CSVs (100+, 1000+ rows) without timeout

### November 29, 2025 (Earlier) - Manual CSV Sync for USDT Transactions
- **Added CSV Upload Sync**: New feature to manually import USDT transactions from exported CSV files
  - Form selects existing BSC API configuration (reuses wallet address and linked account)
  - CSV is parsed and synced using identical logic as Etherscan API syncing
  - Records marked as source 'CSV' (not API)
  - Supports same CSV format exported from Etherscan: Transaction Hash, Blockno, UnixTimestamp, From, To, TokenValue
  - Handles deduplication and filters transactions ≤0.01 USDT
  - Creates journal entries for matched clients automatically
  - Shows detailed sync results: count synced, count skipped

### November 28, 2025 - BSC API V2 Migration & Modern USDT Records
- **Fixed Linked Account Dropdown**: Updated to properly filter accounts with `currency='USDT'` and include the account ID in the data
- **Added Last Synced Block Field**: New field in BSC API configuration form to specify starting block for sync
- **Migrated Sync Logic to Etherscan V2**:
  - Updated API endpoint to `https://api.etherscan.io/v2/api?chainid=56`
  - Changed batch size from 1000 to 100 transactions per sync
  - Added proper startblock handling for incremental syncing
- **New Modern USDT Records Collection**:
  - Changed storage from `/records/usdt` to `/modern_usdt_records`
  - Implemented USDT1, USDT2, USDT3... counter pattern for document IDs
  - Added `modernUsdtRecordId` counter type
- **Enhanced Sync Feedback**: Detailed toast notification showing synced count, skipped count, and last synced block

### October 28, 2025 - BSC API Settings & Etherscan v2 Migration
- **Fixed BSC API Settings Page**: Resolved issue where "Linked Account" dropdown was not selectable when adding new configurations
  - Migrated from manual form handling to `useActionState` hook for proper server action integration
  - Added controlled Select component with hidden input for form submission
  - Improved user feedback with toast notifications
- **Migrated to Etherscan API v2**: Updated blockchain integration from legacy BSCScan API v1 to unified Etherscan API v2
  - Changed endpoint from `api.bscscan.com/api` to `api.etherscan.io/v2/api`
  - Added `chainid=56` parameter for BSC network
  - Updated all error messages and user-facing text to reference Etherscan
  - Maintains backward compatibility with existing wallet configurations
- **Updated Documentation**: All references to BSCScan updated to reflect Etherscan API v2

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 14+ with App Router
- Server-side rendering for improved performance
- React Server Components for data fetching
- Client components for interactive features
- Route groups under `(app)` for consistent layout

**UI Layer**: 
- ShadCN UI components for consistent design system
- Tailwind CSS for utility-first styling
- Lucide Icons for iconography
- Cairo font family for Arabic language support
- Custom color scheme with deep teal primary and light teal background

**State Management**:
- React hooks (`useState`, `useReducer`) for local component state
- Server Actions with `useActionState` for form submissions
- Real-time Firebase listeners for data synchronization
- Custom hooks for reusable logic (`use-transaction-processor`, `use-form-hotkeys`)

### Backend Architecture

**Core Design Principle**: Double-Entry Bookkeeping
- Every financial transaction creates balanced journal entries
- Assets = Liabilities + Equity equation maintained
- Immutability of confirmed transactions
- Complete audit trail through journal entries

**Data Flow Pattern**: Record-First Workflow
1. Financial movements captured as Records (raw, un-reconciled facts)
2. Records can be from Manual entry, SMS parsing, or BSCScan blockchain monitoring
3. Records transition through statuses: Pending → Matched → Used/Confirmed → Cancelled
4. Transactions wrap Records to give business meaning
5. Journal Entries created automatically to maintain accounting integrity

**Key Workflows**:

1. **SMS Processing**:
   - Incoming SMS stored in `/incoming` path
   - Parsed using custom rules or AI (Google Gemini via Genkit)
   - Creates CashRecord with status 'Pending'
   - First journal entry: Debit bank account, Credit suspense account (7000)
   - Name matching attempts to link to existing clients
   - Second journal entry on match: Debit suspense, Credit client sub-account
   - Transaction created to finalize the business operation

2. **Cash Transaction Processing**:
   - Supports both inflow (receipts) and outflow (payments)
   - Multi-currency support (YER, SAR)
   - Automatic USD conversion using current exchange rates
   - Integration with multiple bank accounts
   - Denormalized client and account names for performance

3. **USDT Transaction Processing**:
   - Manual entry or Etherscan API v2 blockchain synchronization for BSC
   - Wallet address validation using ethers.js
   - Support for multiple system wallets
   - Transaction hash tracking for blockchain verification
   - Service provider integration for automated sends
   - Multi-configuration support for monitoring different wallets

4. **Accounting System**:
   - Chart of Accounts with hierarchical structure (groups and postable accounts)
   - Account types: Assets, Liabilities, Equity, Income, Expenses
   - Parent-child relationships for account organization
   - Client sub-accounts automatically created under account 6000
   - Journal entries track all debits and credits
   - Financial reports: Balance Sheet, Income Statement, Trial Balance

### Database Architecture

**Firebase Realtime Database** structure:

**Primary Collections**:
- `/records/cash/{recordId}` - Unified cash transaction ledger
- `/records/usdt/{recordId}` - Unified USDT transaction ledger
- `/clients/{clientId}` - Customer profiles and verification data
- `/accounts/{accountId}` - Chart of accounts
- `/journal_entries/{entryId}` - Double-entry bookkeeping records
- `/transactions/{transactionId}` - Business transaction wrappers
- `/service_providers/{providerId}` - USDT wallet providers

**Supporting Collections**:
- `/incoming` - Raw SMS messages awaiting processing
- `/sms_endpoints/{endpointId}` - SMS gateway configurations
- `/sms_parsing_rules/{ruleId}` - Custom SMS parsing patterns
- `/transaction_flags/{flagId}` - Labels for categorizing transactions
- `/blacklist/{itemId}` - Blocked names/phones for fraud prevention
- `/rate_history` - Historical exchange rates and fees
- `/settings` - System-wide configuration
- `/send_requests` - Queue for automated USDT sends
- `/audit_logs` - Complete activity history

**Data Denormalization Strategy**:
- Client names stored in records for fast display
- Account names cached in transactions
- Reduces need for joins in real-time database
- Trade-off: Slight data redundancy for significant performance gain

**Indexing Strategy**:
- `clientId` indexed on records for fast client-specific queries
- `source` indexed on cash_records for filtering by origin
- `createdAt` indexed for chronological sorting
- `timestamp` indexed on historical data collections

### External Dependencies

**Firebase Services**:
- Realtime Database - Primary data store with real-time synchronization
- Storage - File storage for KYC documents and invoices
- Authentication ready (not yet implemented in codebase)

**AI Integration**:
- Google AI (Gemini) via Genkit for SMS parsing
- Custom prompt engineering for extracting transaction details
- Fallback to manual parsing rules when AI unavailable
- Requires `GEMINI_API_KEY` environment variable

**Blockchain Integration**:
- Etherscan API v2 for monitoring USDT transactions on Binance Smart Chain (chainid: 56)
- Unified API endpoint across 60+ supported blockchain networks
- ethers.js library for wallet address validation
- Transaction hash verification
- Multiple wallet monitoring support with configurable API settings
- Automatic block tracking for incremental syncing

**Third-Party Services**:
- MEXC API SDK for cryptocurrency exchange rates
- Telegram Bot API for real-time notifications
- External SMS gateway (webhook-based) for receiving messages

**Development Tools**:
- TypeScript for type safety
- ESLint and TypeScript compiler with build error ignoring (enabled for rapid development)
- Patch-package for npm dependency modifications
- html2canvas for invoice screenshot generation

**Environment Variables Required**:
- `GEMINI_API_KEY` - Google AI API key for SMS parsing
- `NEXT_PUBLIC_FIREBASE_*` - Firebase configuration
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` - Telegram bot credentials (for notifications)
- `BSC_RPC_URL` - Binance Smart Chain RPC endpoint for wallet operations
- `TRUST_WALLET_MNEMONIC` - Trust Wallet recovery phrase for wallet operations
- Etherscan API key (stored in database `/bsc_apis` collection for blockchain monitoring)

**Image Hosting**:
- Firebase Storage for uploaded documents
- placehold.co for placeholder images
- ycoincash.com for logo assets