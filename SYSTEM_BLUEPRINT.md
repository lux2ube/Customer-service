# System Blueprint: Customer Central

## 1. Introduction

This document provides an ultra-detailed blueprint of the Customer Central application. It is intended for developers to understand the system's architecture, data flow, component design, and core business logic.

---

## 2. Core Technologies

-   **Framework**: Next.js 14+ (with App Router)
-   **Language**: TypeScript
-   **UI**: ShadCN UI, Tailwind CSS, Lucide Icons
-   **Database**: Firebase Realtime Database
-   **File Storage**: Firebase Storage
-   **AI Integration**: Google AI (Gemini) via Genkit for SMS parsing.
-   **State Management**: Combination of React Server Components, `useState`, `useReducer`, and server actions (`useActionState`).

---

## 3. Core Concepts

-   **Double-Entry Bookkeeping**: Every financial action is intended to result in a balanced journal entry, ensuring that Assets = Liabilities + Equity. The `/journal_entries` collection is the ultimate source of financial truth.
-   **Record-First Workflow**: Financial movements (cash or crypto) are first captured as `Record` objects (`/records/cash` or `/records/usdt`). These are raw, un-reconciled facts (e.g., "we received 1000 YER").
-   **Transaction Consolidation**: A `Transaction` (`/transactions`) is a conceptual wrapper that gives business meaning to one or more `Records`. For example, a "Deposit" `Transaction` links a `Cash Record` (client gives cash) to a `USDT Record` (we give USDT).
-   **Immutability (Intended)**: Once a `Transaction` is `Confirmed`, it and its associated `Records` should be considered immutable. Changes should be made via reversing entries or new transactions.

---

## 4. In-Depth Project Structure

```
src
├── app/
│   ├── (app)/                # Main application routes with shared layout
│   │   ├── clients/          # Client list, add, edit, merge pages
│   │   ├── transactions/     # Transaction list, add, invoice pages
│   │   ├── accounting/       # Chart of Accounts, Journal pages
│   │   ├── reports/          # All financial reports
│   │   ├── sms/              # SMS settings, parsing rules, failure logs
│   │   ├── settings/         # System-wide settings (API keys, etc.)
│   │   └── ... (other pages)
│   ├── api/                  # (Not used) API routes if needed
│   ├── layout.tsx            # Root layout
│   └── globals.css           # Global styles & ShadCN theme variables
├── components/
│   ├── ui/                   # Unmodified ShadCN UI components (Button, Card, etc.)
│   ├── client-form.tsx       # Core component for creating/editing clients
│   ├── transaction-form.tsx  # Core component for creating transactions
│   ├── ... (other reusable components)
├── lib/
│   ├── actions/              # ALL server actions, organized by domain (client, transaction, etc.)
│   ├── firebase.ts           # Firebase app initialization and configuration
│   ├── types.ts              # ALL core TypeScript types and interfaces
│   └── utils.ts              # Utility functions (e.g., cn for classnames)
├── ai/
│   ├── flows/                # Genkit flows for AI tasks
│   │   └── parse-sms-flow.ts # The AI prompt and logic for parsing SMS
│   └── genkit.ts             # Genkit initialization
├── hooks/
│   └── use-toast.ts          # Custom hook for displaying toasts
...
```

---

## 5. Detailed Database Schema

This mirrors `DATABASE_STRUCTURE.md` but with added context.

-   **/clients/{clientId}**: The master record for each customer. Contains PII, KYC docs, and verification status. The `{clientId}` is a sequential number.
-   **/accounts/{accountId}**: The Chart of Accounts. The heart of the accounting system. Contains asset accounts (bank accounts, crypto wallets), liability accounts (client balances), income, and expenses.
-   **/records/cash/{recordId}**: The immutable ledger for all cash movements. Every time cash is received or paid out, a record is created here.
-   **/records/usdt/{recordId}**: The immutable ledger for all USDT movements, whether manually recorded or synced from BSCScan.
-   **/transactions/{transactionId}**: A consolidated view linking records together. A `Deposit` transaction, for instance, links a `cash` inflow record to a `usdt` outflow record. This is where fees are calculated.
-   **/journal_entries/{entryId}**: The double-entry ledger. Every `Transaction` generates journal entries that move funds between `Accounts`. This is the definitive source for financial reports.
-   **/service_providers/{providerId}**: Groups of bank or crypto accounts, used for defining custom rules or payment formulas (e.g., all "Al-Amal Bank" accounts).
-   **/sms_endpoints/{endpointId}**: Configurations for the SMS Gateway, linking an incoming SMS source to a specific bank account in the Chart of Accounts.
-   **/counters/**: Atomic counters used to generate sequential, human-readable IDs for new records and transactions, preventing race conditions.

---

## 6. Step-by-Step Workflow Analysis

### Workflow 1: SMS Parsing and Reconciliation

**Goal**: To reliably convert an incoming SMS into a `Cash Record` and associate it with the correct client.

1.  **Ingestion**: An external SMS Gateway `POST`s a JSON payload to a unique URL generated in **SMS Gateway Setup**. The URL corresponds to a specific `/sms_endpoints/{endpointId}`. Firebase stores this raw payload under `/incoming/{endpointId}`.
2.  **Manual Trigger**: The user clicks the "Process Incoming SMS" button on the dashboard or Cash Records page.
3.  **Action: `processIncomingSms`** (`/lib/actions/sms.ts`):
    *   Reads all messages from the `/incoming` path.
    *   De-duplicates messages by checking against the `rawSms` field of recently created cash records.
    *   For each new message:
        *   It first tries to match the SMS against all **Custom Parsing Rules** from `/sms_parsing_rules`. These are regex-based for speed and reliability with known formats.
        *   If no custom rule matches, it calls the **AI Parser** (`/ai/flows/parse-sms-flow.ts`) as a fallback.
        *   The AI Parser sends the SMS body to the Gemini model with a detailed prompt instructing it to extract `type` (inflow/outflow), `amount`, and `person`.
    *   **Validation**:
        *   If the parser (custom or AI) returns a valid `type`, `amount`, and `person`, the action proceeds.
        *   If parsing fails, the raw SMS is stored in `/sms_parsing_failures` for manual review.
4.  **Record Creation**:
    *   A new `Cash Record` is created in `/records/cash/`.
    *   `status` is set to **`Pending`**.
    *   `clientId` and `clientName` are `null`.
    *   `source` is set to **`SMS`**.
5.  **Manual Matching (Separate Action)**:
    *   A user can manually link a `Pending` SMS record to a client.
    *   The `linkSmsToClient` action is called.
    *   This action updates the `Cash Record`'s `status` to **`Matched`** and fills in the `clientId` and `clientName`.

### Workflow 2: Transaction Creation (Deposit Example)

**Goal**: To formally record a client's deposit, where they give cash in exchange for USDT, while calculating fees and generating balanced accounting entries.

1.  **Initiation**: User navigates to the "New Transaction" page.
2.  **UI: `TransactionForm`** (`/components/transaction-form.tsx`):
    *   User selects "Deposit" as the `type`.
    *   User selects a `Client` using the smart search component.
    *   The form calls the `getUnifiedClientRecords` server action to fetch all `Matched` or `Confirmed` `Cash` and `USDT` records for that client.
3.  **Record Linking**:
    *   The user selects the relevant `Cash Record` from the "Client Gives" column (e.g., the 50,000 YER they deposited).
    *   The user selects the `USDT Record` from the "Client Gets" column (e.g., the 95 USDT that was sent to them). This record could have been created manually or by the "Auto Send" feature.
4.  **Calculation (Client-Side)**:
    *   The form calculates the total USD value of all selected inflows and outflows.
    *   It calculates the `fee` based on the USDT amount and the global fee settings.
    *   It displays the `difference` (`inflow - (outflow + fee)`). If non-zero, it presents options to record the difference as income or an expense.
5.  **Submission**: User clicks "Create Transaction". The `createModernTransaction` server action is called.
6.  **Action: `createModernTransaction`** (`/lib/actions/transaction.ts`):
    *   **Validation**: It re-validates all inputs using Zod.
    *   **Data Fetching**: It re-fetches the linked records and client data from the database to prevent stale data.
    *   **Transaction Object Creation**: It assembles the final `Transaction` object, including the `summary` block with all calculated totals.
    *   **Journal Entry Generation**: It calls `createJournalEntriesForTransaction` to generate the double-entry records. For a deposit, this would be:
        1.  `DEBIT` Bank Account (Asset+), `CREDIT` Client's Liability Account (Liability+): *For the cash received.*
        2.  `DEBIT` Client's Liability Account (Liability-), `CREDIT` USDT Wallet (Asset-): *For the USDT sent.*
        3.  `DEBIT` Client's Liability Account (Liability-), `CREDIT` Fee Income (Income+): *For the fee charged.*
    *   **Database Updates**: It constructs a single multi-path `update` object for an atomic write to Firebase, which:
        1.  Writes the new `Transaction` to `/transactions/{newId}`.
        2.  Writes all `JournalEntry` objects to `/journal_entries/`.
        3.  Updates the `status` of all linked `Cash` and `USDT` records to **`Used`**.
7.  **Revalidation**: It uses `revalidatePath` to tell Next.js to refresh the data on the relevant pages (transactions, reports, etc.).

---

## 7. Component & Page Breakdown

-   **`ClientForm`**: A large, multi-tabbed component for all client-related data. It handles basic info, file uploads for KYC, and displays activity history and linked accounts. It uses a `manageClient` server action that internally routes logic based on an "intent" field (e.g., `delete:doc_name`).
-   **`TransactionForm`**: The most complex component. It orchestrates client selection, fetching available financial records, real-time calculation of totals and fees, and submitting the final consolidated transaction.
-   **`ChartOfAccountsTable`**: Renders a hierarchical view of the accounts. It performs real-time balance calculation by fetching all journal entries and aggregating the totals up the account tree structure on the client side.
-   **`...Report` components (e.g., `BalanceSheetReport`)**: These are client components that receive all necessary data (all accounts, all journal entries) as initial props. They perform all calculations and filtering (e.g., by date) on the client side using `useMemo` for performance.
-   **`...RecordsTable` components**: These display lists of raw records (cash or USDT). They handle client-side filtering, sorting, and pagination.

This blueprint provides a comprehensive overview of the system's design and logic.