# Firebase Realtime Database Structure

This document outlines the data structure used in the Firebase Realtime Database for this application.

## Root Paths

The database is organized into several top-level keys, each representing a collection of data.

---

### 1. `/records/cash/{recordId}`

**Unified ledger for all cash-based transactions (inflows and outflows).** This is a primary source of truth for all manual or SMS-based fiat currency movements. `{recordId}` is a sequential number from a shared counter.

-   **`id`**: `string` - The unique, sequential ID for the record (e.g., "1001", "1002").
-   **`date`**: `string` (ISO 8601) - The date of the transaction.
-   **`type`**: `'inflow' | 'outflow'` - Whether the transaction is money coming in or going out.
-   **`source`**: `'Manual' | 'SMS'` - The origin of the record.
-   **`status`**: `'Pending' | 'Matched' | 'Used' | 'Cancelled' | 'Confirmed'` - The lifecycle status of the record.
-   **`clientId`**: `string | null` - The ID of the client associated with the record (can be null if unmatched).
-   **`clientName`**: `string | null` - Denormalized client name for display.
-   **`accountId`**: `string` - The ID of the internal bank/cash account affected.
-   **`accountName`**: `string` - Denormalized account name for display.
-   **`senderName`**: `string` (for inflows) - The name of the person/entity sending the money.
-   **`recipientName`**: `string` (for outflows) - The name of the person/entity receiving the money.
-   **`amount`**: `number` - The amount in the native currency of the account.
-   **`currency`**: `string` - The currency code (e.g., 'YER', 'SAR').
-   **`amountusd`**: `number` - The calculated USD value of the transaction.
-   **`notes`**: `string` (optional) - Any additional notes. For SMS records, this defaults to the raw SMS text.
-   **`rawSms`**: `string` (optional, for `source: 'SMS'`) - The original text of the SMS.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the record was created.

---

### 2. `/records/usdt/{recordId}`

**Unified ledger for all USDT-based transactions (inflows and outflows).** `{recordId}` is a sequential number from a shared counter.

-   **`id`**: `string` - The unique, sequential ID for the record.
-   **`date`**: `string` (ISO 8601) - The date of the transaction.
-   **`type`**: `'inflow' | 'outflow'` - Whether the transaction is USDT coming in or going out.
-   **`source`**: `'Manual' | 'BSCScan'` - The origin of the record.
-   **`status`**: `'Pending' | 'Used' | 'Cancelled' | 'Confirmed'` - The lifecycle status of the record.
-   **`clientId`**: `string | null` - The ID of the client associated with the record.
-   **`clientName`**: `string | null` - Denormalized client name for display.
-   **`accountId`**: `string` - The ID of the internal system USDT wallet affected.
-   **`accountName`**: `string` - Denormalized wallet name for display.
-   **`amount`**: `number` - The amount of USDT.
-   **`notes`**: `string` (optional) - Any additional notes.
-   **`txHash`**: `string` (optional) - The blockchain transaction hash.
-   **`clientWalletAddress`**: `string` (optional) - The client's external wallet address.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the record was created.

---

### 3. `/transactions/{transactionId}`

**Primary store for consolidated, finalized transactions.** A transaction is created by linking one or more records from `/records/cash` or `/records/usdt`. `{transactionId}` starts with "T-" and is sequential.

-   **`id`**: `string` - The unique, sequential ID for the transaction.
-   **`date`**: `string` (ISO 8601) - The date the transaction was created.
-   **`type`**: `'Deposit' | 'Withdraw' | 'Transfer'` - The type of transaction.
-   **`clientId`**: `string` - The ID of the client.
-   **`clientName`**: `string` - Denormalized client name.
-   **`status`**: `'Pending' | 'Confirmed' | 'Cancelled'` - The status of the transaction.
-   **`notes`**: `string` (optional) - Any additional notes for the transaction.
-   **`attachment_url`**: `string` (optional) - URL for any uploaded attachment.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the transaction was created.

-   **`inflows`**: `TransactionLeg[]` - An array detailing all funds received.
    -   `recordId`: `string` - ID from `/records/cash` or `/records/usdt`.
    -   `type`: `'cash' | 'usdt'`
    -   `accountId`: `string` - The internal account that received the funds.
    -   `accountName`: `string`
    -   `amount`: `number`
    -   `currency`: `string`
    -   `amount_usd`: `number`

-   **`outflows`**: `TransactionLeg[]` - An array detailing all funds paid out.
    -   (Same structure as `inflows`)

-   **`summary`**: `object` - An object containing the calculated totals for the transaction.
    -   `total_inflow_usd`: `number`
    -   `total_outflow_usd`: `number`
    -   `fee_usd`: `number`
    -   `net_difference_usd`: `number` - The final balance of the transaction (inflow - (outflow + fee)).

---

### 4. `/journal_entries/{entryId}`

**The core of the double-entry accounting system.** This is the definitive ledger of all financial movements between accounts. Every transaction from `transactions` generates one or more entries here.

-   **`id`**: `string` - Unique push ID.
-   **`date`**: `string` (ISO 8601) - The date of the journal entry.
-   **`description`**: `string` - A human-readable description of the transaction.
-   **`debit_account`**: `string` - The ID of the account being debited.
-   **`credit_account`**: `string` - The ID of the account being credited.
-   **`debit_account_name`**: `string` (denormalized) - The name of the debited account.
-   **`credit_account_name`**: `string` (denormalized) - The name of the credited account.
-   **`debit_amount`**: `number` - The amount in the debit account's native currency.
-   **`credit_amount`**: `number` - The amount in the credit account's native currency.
-   **`amount_usd`**: `number` - The value of the transaction in USD, for consistent reporting.
-   **`createdAt`**: `string` (ISO 8601) - Timestamp of creation.
-   **`details`**: `object[]` (optional) - For multi-leg transactions, this stores the original transaction legs.

---

### 5. `/accounts/{accountId}`

Stores the Chart of Accounts records. Each record can be a group (like "Assets") or a postable account (like "Cash - YER").

-   **`id`**: `string` - The unique code for the account (e.g., "1001").
-   **`name`**: `string` - The display name of the account (e.g., "Al-Amal Bank").
-   **`type`**: `string` - The accounting type ('Assets', 'Liabilities', 'Equity', 'Income', 'Expenses').
-   **`isGroup`**: `boolean` - If `true`, this is a parent account and cannot have transactions posted to it directly.
-   **`parentId`**: `string | null` - The ID of the parent group account, if any.
-   **`currency`**: `string | null` - The currency code (e.g., 'YER', 'SAR', 'USDT') for postable accounts.
-   **`priority`**: `number` - A number used for sorting accounts in the UI.

---

### 6. `/clients/{clientId}`

Stores all customer information. After the initial migration, `{clientId}` is a sequential number starting from `1000001`.

-   **`name`**: `string` - The client's full name.
-   **`phone`**: `string[]` - An array of the client's phone numbers.
-   **`bep20_addresses`**: `string[]` (optional) - An array of the client's BEP20 wallet addresses.
-   **`kyc_documents`**: `object[]` (optional) - An array of objects for KYC documents.
-   **`verification_status`**: `string` - The client's status ('Active', 'Inactive', 'Pending').
-   **`prioritize_sms_matching`**: `boolean` (optional) - If `true`, this client gets priority in auto-matching SMS messages.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the client was created.

---

### 7. `/counters`

Stores atomic counters for generating sequential IDs.

-   **/`cashRecordId`**: `number` - The last used ID for the new unified cash records.
-   **/`usdtRecordId`**: `number` - The last used ID for the new unified USDT records.
-   **/`bscApiId`**: `number` - The last used ID for BSC API configurations.
-   **/`transactionId`**: `number` - The last used ID for the new `transactions` table.
