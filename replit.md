# Customer Central - Financial Transaction Management System

## Overview

Customer Central is a comprehensive financial transaction management system built with Next.js and Firebase, designed for a currency exchange business. It manages customer profiles, cash and cryptocurrency (USDT) transactions, and implements double-entry accounting. Key capabilities include SMS parsing with AI, automated transaction processing, multi-currency support (YER, SAR, USDT), and a complete audit trail through journal entries. The system aims to streamline financial operations by tracking both fiat and crypto movements efficiently.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Next.js 14+ with App Router, utilizing server-side rendering and React Server Components for performance, and client components for interactivity.
**UI Layer**: ShadCN UI, Tailwind CSS, Lucide Icons, and Cairo font for Arabic support. Features a custom color scheme with deep teal primary and light teal background.
**State Management**: React hooks for local state, Server Actions with `useActionState` for forms, and real-time Firebase listeners for data synchronization.

### Backend Architecture

**Core Design Principle**: Double-Entry Bookkeeping, ensuring every financial transaction creates balanced journal entries and maintains an immutable audit trail.
**Data Flow Pattern**: "Record-First Workflow" where raw financial movements (from manual entry, SMS, or blockchain monitoring) are captured as Records. Records transition through statuses (Pending → Matched → Used/Confirmed → Cancelled), Transactions wrap Records for business meaning, and Journal Entries are automatically created.

**Key Workflows**:
-   **SMS Processing**: Incoming SMS are parsed using AI (Google Gemini via Genkit) or custom rules, creating 'Pending' CashRecords. These are then matched to clients, generating appropriate journal entries.
-   **Cash Transaction Processing**: Supports multi-currency (YER, SAR) inflows and outflows, automated USD conversion, and integration with multiple bank accounts.
-   **USDT Transaction Processing**: Includes manual entry, Etherscan API v2 blockchain synchronization for BSC, wallet address validation, transaction hash tracking, and service provider integration for automated sends. Also supports CSV import of USDT transactions.
-   **Accounting System**: Features a Chart of Accounts with hierarchical structure (Assets, Liabilities, Equity, Income, Expenses), automatic client sub-accounts, and generates financial reports.

### Database Architecture

**Firebase Realtime Database** is the primary data store, organized into:
-   **Primary Collections**: `/records/cash`, `/records/usdt`, `/clients`, `/accounts`, `/journal_entries`, `/transactions`, `/service_providers`.
-   **Supporting Collections**: `/incoming`, `/sms_endpoints`, `/sms_parsing_rules`, `/transaction_flags`, `/blacklist`, `/rate_history`, `/settings`, `/send_requests`, `/audit_logs`.
**Data Denormalization Strategy**: Client and account names are denormalized within records and transactions for performance, reducing the need for joins.
**Indexing Strategy**: `clientId`, `source`, `createdAt`, and `timestamp` are indexed for efficient querying and sorting.

## External Dependencies

**Firebase Services**: Realtime Database for data, Storage for files.
**AI Integration**: Google AI (Gemini) via Genkit for SMS parsing, requiring `GEMINI_API_KEY`.
**Blockchain Integration**: Etherscan API v2 for monitoring USDT transactions on Binance Smart Chain (chainid: 56), utilizing ethers.js for wallet validation.
**Third-Party Services**: MEXC API SDK for crypto exchange rates, Telegram Bot API for notifications, and external webhook-based SMS gateways.
**Development Tools**: TypeScript, ESLint, Patch-package, html2canvas.

**Environment Variables Required**:
-   `GEMINI_API_KEY`
-   `NEXT_PUBLIC_FIREBASE_*` (Firebase configuration)
-   `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
-   `BSC_RPC_URL`
-   `TRUST_WALLET_MNEMONIC`
-   Etherscan API key (stored in database `/bsc_apis`)