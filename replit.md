# Customer Central - Financial Transaction Management System

## Overview

Customer Central is a comprehensive financial transaction management system built with Next.js and Firebase. The application manages customer profiles, cash and cryptocurrency (USDT) transactions, and implements double-entry accounting principles. It features SMS parsing with AI, automated transaction processing, and multi-currency support (YER, SAR, USDT).

The system is designed to handle financial operations for a currency exchange business, tracking both fiat currency movements and cryptocurrency transactions while maintaining a complete audit trail through journal entries.

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
   - Manual entry or BSCScan blockchain synchronization
   - Wallet address validation using ethers.js
   - Support for multiple system wallets
   - Transaction hash tracking for blockchain verification
   - Service provider integration for automated sends

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
- BSCScan API for monitoring USDT transactions on Binance Smart Chain
- ethers.js library for wallet address validation
- Transaction hash verification
- Multiple wallet monitoring support

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
- Telegram bot credentials (for notifications)
- BSCScan API credentials (for blockchain monitoring)

**Image Hosting**:
- Firebase Storage for uploaded documents
- placehold.co for placeholder images
- ycoincash.com for logo assets