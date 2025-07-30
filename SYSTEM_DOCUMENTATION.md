
# System Architecture & Workflow Documentation

This document provides a detailed overview of the application's structure, components, and data flow. It is intended to help developers understand how the system works.

## 1. Core Technologies

- **Framework**: Next.js (with App Router)
- **UI Components**: ShadCN UI, Tailwind CSS
- **Backend & Database**: Firebase (Realtime Database & Storage)
- **AI Integration**: Google AI with Genkit (for SMS parsing)
- **Language**: TypeScript

## 2. Project Structure

- `src/app/(app)`: Contains all the main pages of the application. The `(app)` is a route group, meaning it doesn't affect the URL.
- `src/components`: Reusable React components used across various pages.
- `src/lib`: Core application logic, server actions, Firebase configuration, and data type definitions.
- `src/ai`: AI-related code, specifically Genkit flows for parsing SMS messages.

## 3. Core Data Models (`src/lib/types.ts`)

- **Client**: Represents a customer. Contains personal details, verification status, and financial account information.
- **Transaction**: Represents a financial transaction (Deposit/Withdraw). Linked to a Client.
- **Account**: The core of the Chart of Accounts. Can be a group account or a postable account with a specific currency.
- **SmsTransaction**: An intermediate record created when an SMS is parsed. It holds the raw data before it's linked to a client and used in a formal `Transaction`.
- **JournalEntry**: Records debits and credits between `Accounts` for double-entry bookkeeping.

## 4. Key Workflows

### 4.1. SMS Processing & Accounting Workflow

This is the most critical workflow in the system. It ensures every financial movement is tracked with accounting principles.

1.  **SMS Received**: An external SMS gateway `POST`s a raw SMS message to a unique URL provided by the **SMS Gateway Setup** page. This message is stored in the `/incoming` path in Firebase.
2.  **Parsing (`processIncomingSms` action)**:
    - This action is triggered manually from the dashboard or SMS pages.
    - It reads messages from `/incoming`.
    - It first tries to match the SMS against custom rules defined in **SMS Parsing Rules**.
    - If no custom rule matches, it uses the AI Parser (`src/ai/flows/parse-sms-flow.ts`) to extract details (amount, person, type).
    - A new `SmsTransaction` is created with `status: 'parsed'`.
    - **Journal Entry #1**: A journal entry is created to debit the bank's account and credit a temporary suspense account: `7000 - Unmatched Funds`. This secures the funds in the accounting system.
3.  **Matching (`matchSmsToClients` action)**:
    - This action is triggered manually.
    - It attempts to link `parsed` SMS transactions to existing `Clients` based on name-matching rules defined for the SMS endpoint.
    - If a confident match is found, the `SmsTransaction` status is updated to `matched`.
    - **Journal Entry #2**: A second journal entry is created to reverse the first entry and move the funds to the client's dedicated account.
        - It debits `7000 - Unmatched Funds`.
        - It credits the client's sub-account (e.g., `6001 - Client Name`). If the client account doesn't exist under `6000 - Clients`, it is created automatically.
4.  **Transaction Creation**:
    - When a user creates a `Transaction` in the UI and links it to a `matched` SMS, the `SmsTransaction` is marked as `used`.
    - This `Transaction` now represents the client's official instruction (e.g., "deposit this cash and give me USDT").
    - The transaction form calculates fees and the final USDT amount.
    - **Journal Entry #3 (and #4)**: When the transaction is saved, journal entries are created to reflect the final movement of funds (e.g., from the client's sub-account `6001` to the `USDT Wallet` asset account, with fees going to a `Profit` income account).

### 4.2. BSCScan Sync Workflow

- The **Sync with BSCScan** button triggers the `syncBscTransactions` server action.
- It fetches recent transactions for the wallet address configured in **Settings**.
- It checks for transaction hashes that don't already exist in the database.
- For each new transaction, it creates a `Transaction` record with `status: 'Pending'` and `clientId: 'unassigned-bscscan'`.
- The **Auto-Process Deposits** action then tries to link these synced transactions to `matched` SMS records based on the client and amount.

## 5. Pages Breakdown (`src/app/(app)/...`)

| Page                               | Purpose & Functionality                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard (`/`)**                | The main landing page. Shows key statistics (client count, transaction volume), a chart for daily volume, and provides quick access to common actions and system-wide automation triggers (Sync, Process SMS, etc.).                           |
| **Clients (`/clients`)**           | Displays a searchable and filterable table of all clients. Allows for creating new clients, importing/exporting, and navigating to edit a client's profile.                                                                                    |
| **Client Form (`/clients/add`)**   | A form to create or edit a client. Manages personal info, phone numbers, KYC documents, and labels. It also displays the client's account balance and transaction history.                                                                      |
| **Transactions (`/transactions`)** | Displays a searchable and filterable table of all financial transactions. Allows for manual creation of transactions and bulk actions.                                                                                                        |
| **Transaction Form (`/tx/add`)**   | A form to create or edit a transaction. This is a central hub that links clients to their funds, calculates fees, and shows SMS suggestions to speed up data entry. Generates an invoice view.                                                     |
| **Chart of Accounts (`/coa`)**     | Manages the company's entire chart of accounts. Allows creating/editing accounts (e.g., Assets, Liabilities, Client sub-accounts) and organizing them into groups. Displays real-time balances for all accounts.                                 |
| **Journal (`/journal`)**           | Displays a log of all double-entry bookkeeping records (`JournalEntry`). Provides a clear audit trail of every financial movement in the system.                                                                                                |
| **SMS Transactions (`/sms/tx`)**   | A table view of all parsed SMS messages (`SmsTransaction`). Shows their status (parsed, matched, used) and allows for manual actions like linking to a client.                                                                                    |
| **SMS Gateway Setup (`/sms/settings`)** | Configure unique endpoints for different SMS providers. Each endpoint is linked to a bank account and has its own set of name-matching rules for the `matchSmsToClients` action.                                                             |
| **SMS Parsing Rules (`/sms/parsing`)** | Create custom, regex-like rules to parse specific SMS formats without relying on the AI. This is faster and more reliable for known formats. Includes a testing tool.                                                                          |
| **Blacklist (`/blacklist`)**       | Manage a list of names, phone numbers, or wallet addresses that should be flagged. The system automatically checks against this list during client and transaction creation.                                                                      |
| **Labels (`/labels`)**             | Create and manage custom color-coded labels that can be applied to clients and transactions for better organization and flagging (e.g., "High Risk", "VIP").                                                                                     |
| **Reports (`/reports`)**           | A hub for all financial reports, including the Income Statement, Balance Sheet, and Trial Balance. These reports are generated in real-time from the journal entries.                                                                            |
| **Settings (`/settings`)**         | Configure system-wide settings like currency exchange rates, transaction fees, and API keys for external services (BscScan, Gemini AI).                                                                                                      |

## 6. Key Components Breakdown (`src/components/...`)

| Component                         | Purpose & Functionality                                                                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`client-form.tsx`**             | The main UI for creating and editing clients. It handles file uploads for KYC, manages multiple phone numbers, and displays related financial data.                                      |
| **`transaction-form.tsx`**        | A complex form for managing transactions. It features a client search (`ClientSelector`), account selection (`BankAccountSelector`), and dynamically shows SMS suggestions.                |
| **`chart-of-accounts-table.tsx`** | Renders a hierarchical tree view of the chart of accounts. It calculates and displays real-time balances for every account by aggregating data from all journal entries and transactions. |
| **`sms-transactions-table.tsx`**  | Displays parsed SMS messages and allows for manual actions. It includes a dialog with a client search to manually link an SMS to a client.                                                  |
| **`balance-sheet-report.tsx`**    | A client-side component that takes all accounts and journal entries to compute and render a standard balance sheet report for a given date.                                               |
| **`page-header.tsx`**             | A standardized header component used on every page for a consistent title, description, and action buttons layout.                                                                       |
| **`nav.tsx`**                     | Defines the main navigation menu in the sidebar, controlling the links, icons, and structure.                                                                                            |
| **`ui/sidebar.tsx`**              | A highly reusable and customizable sidebar component that handles desktop (collapsible) and mobile (off-canvas) states.                                                                  |

This documentation should serve as a solid foundation for understanding the application.
