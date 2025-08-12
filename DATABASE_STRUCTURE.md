
# Firebase Realtime Database Structure

This document outlines the data structure used in the Firebase Realtime Database for this application.

## Root Paths

The database is organized into several top-level keys, each representing a collection of data.

---

### 1. `/modern_cash_records/{recordId}`

**Primary store for all cash-based transactions (inflows and outflows).** This is the new, unified ledger for cash movements, replacing the separate `cash_receipts` and parts of the `sms_transactions` paths. `{recordId}` is a sequential number.

-   **`id`**: `string` - The unique, sequential ID for the record (e.g., "1001", "1002").
-   **`date`**: `string` (ISO 8601) - The date of the transaction.
-   **`type`**: `'inflow' | 'outflow'` - Whether the transaction is money coming in or going out.
-   **`source`**: `'Manual' | 'SMS'` - The origin of the record.
-   **`status`**: `'Pending' | 'Matched' | 'Used' | 'Cancelled'` - The lifecycle status of the record.
-   **`clientId`**: `string | null` - The ID of the client associated with the record (can be null if unmatched).
-   **`clientName`**: `string | null` - Denormalized client name for display.
-   **`accountId`**: `string` - The ID of the internal bank/cash account affected.
-   **`accountName`**: `string` - Denormalized account name for display.
-   **`senderName`**: `string` (for inflows) - The name of the person/entity sending the money.
-   **`recipientName`**: `string` (for outflows) - The name of the person/entity receiving the money.
-   **`amount`**: `number` - The amount in the native currency of the account.
-   **`currency`**: `string` - The currency code (e.g., 'YER', 'SAR').
-   **`amountUsd`**: `number` - The calculated USD value of the transaction.
-   **`notes`**: `string` (optional) - Any additional notes.
-   **`rawSms`**: `string` (optional, for `source: 'SMS'`) - The original text of the SMS.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the record was created.

---

### 2. `/accounts/{accountId}`

Stores the Chart of Accounts records. Each record can be a group (like "Assets") or a postable account (like "Cash - YER").

-   **`id`**: `string` - The unique code for the account (e.g., "1001").
-   **`name`**: `string` - The display name of the account (e.g., "Al-Amal Bank").
-   **`type`**: `string` - The accounting type ('Assets', 'Liabilities', 'Equity', 'Income', 'Expenses').
-   **`isGroup`**: `boolean` - If `true`, this is a parent account and cannot have transactions posted to it directly.
-   **`parentId`**: `string | null` - The ID of the parent group account, if any.
-   **`currency`**: `string | null` - The currency code (e.g., 'YER', 'SAR', 'USDT') for postable accounts.
-   **`priority`**: `number` - A number used for sorting accounts in the UI.

---

### 3. `/blacklist/{pushId}`

Stores a list of identifiers that should be flagged during data entry.

-   **`type`**: `string` - The type of value being blacklisted ('Name', 'Phone', 'Address').
-   **`value`**: `string` - The value to match against (e.g., a phone number or wallet address).
-   **`reason`**: `string` (optional) - A note explaining why the item was blacklisted.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the item was added.

---

### 4. `/clients/{clientId}`

Stores all customer information. After the initial migration, `{clientId}` is a sequential number starting from `1000001`.

-   **`name`**: `string` - The client's full name.
-   **`phone`**: `string[]` - An array of the client's phone numbers.
-   **`bep20_addresses`**: `string[]` (optional) - An array of the client's BEP20 wallet addresses.
-   **`kyc_documents`**: `object[]` (optional) - An array of objects for KYC documents.
    -   **`name`**: `string` - The name of the uploaded file.
    -   **`url`**: `string` - The public download URL from Firebase Storage.
    -   **`uploadedAt`**: `string` (ISO 8601) - The upload timestamp.
-   **`verification_status`**: `string` - The client's status ('Active', 'Inactive', 'Pending').
-   **`prioritize_sms_matching`**: `boolean` (optional) - If `true`, this client gets priority in auto-matching SMS messages.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the client was created.
-   **`favoriteBankAccountId`**: `string` (optional) - The ID of the bank account last used by this client for a transaction.
-   **`favoriteBankAccountName`**: `string` (optional) - The name of the favorite bank account.

---

### 5. `/journal_entries/{pushId}`

Stores all double-entry bookkeeping records, forming the general ledger.

-   **`date`**: `string` (ISO 8601) - The date of the journal entry.
-   **`description`**: `string` - A description of the transaction.
-   **`debit_account`**: `string` - The ID of the account being debited.
-   **`credit_account`**: `string` - The ID of the account being credited.
-   **`debit_amount`**: `number` - The amount in the debit account's native currency.
-   **`credit_amount`**: `number` - The amount in the credit account's native currency.
-   **`amount_usd`**: `number` - The value of the transaction in USD.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the entry was recorded.

---

### 6. `/logs/{pushId}`

An audit trail of important actions performed in the system.

-   **`action`**: `string` - The name of the action performed (e.g., 'create_client').
-   **`entityId`**: `string` - The ID of the entity that was affected.
-   **`entityType`**: `string` - The type of entity ('client', 'account', etc.).
-   **`entityName`**: `string` (optional) - The name of the entity.
-   **`timestamp`**: `string` (ISO 8601) - When the action occurred.
-   **`user`**: `string` - The user who performed the action (currently 'system_user').
-   **`details`**: `object` (optional) - A snapshot of the data that was changed.

---

### 7. `/rate_history`

A log of all changes to exchange rates and fees.

-   **/`fiat_rates`/{pushId}**:
    -   **`rates`**: `object[]` - An array of fiat rate objects for each currency.
    -   **`timestamp`**: `string` (ISO 8601).
-   **/`crypto_fees`/{pushId}**:
    -   **`buy_fee_percent`**: `number`
    -   **`sell_fee_percent`**: `number`
    -   **`minimum_buy_fee`**: `number`
    -   **`minimum_sell_fee`**: `number`
    -   **`timestamp`**: `string` (ISO 8601).

---

### 8. `/send_requests/{pushId}`

A log of USDT sending requests made from the internal wallet.

-   **`to`**: `string` - The recipient's BEP20 address.
-   **`amount`**: `number` - The amount of USDT sent.
-   **`status`**: `string` - The status of the send request ('pending', 'sent', 'failed').
-   **`timestamp`**: `number` (Unix) - When the request was initiated.
-   **`txHash`**: `string` (optional) - The blockchain transaction hash.
-   **`error`**: `string` (optional) - Any error message if the send failed.

---

### 9. `/sms_transactions/{pushId}` (Legacy)

Stores records created from parsing incoming SMS messages. **This path is being phased out in favor of `/modern_cash_records`**. New SMS messages will no longer be stored here.

-   **`client_name`**: `string` - The name of the person parsed from the SMS text.
-   **`account_id`**: `string` - The ID of the bank account that received the SMS.
-   **`amount`**: `number` - The amount parsed from the SMS.
-   **`currency`**: `string` - The currency of the bank account.
-   **`type`**: `string` - 'credit' or 'debit'.
-   **`status`**: `string` - The current stage ('parsed', 'matched', 'used', 'rejected').
-   **`parsed_at`**: `string` (ISO 8601) - When the SMS was processed.
-   **`raw_sms`**: `string` - The original, full text of the SMS.
-   **`matched_client_id`**: `string` (optional) - The ID of the client this SMS was matched to.
-   **`matched_client_name`**: `string` (optional) - The name of the matched client.

---

### 10. `/transactions/{transactionId}`

The primary record for all financial trades (buy/sell USDT). This record ties together clients, funds (from cash receipts or SMS), and financial details.

-   **`id`**: `string` - The transaction's unique ID.
-   **`date`**: `string` (ISO 8601) - The date of the transaction.
-   **`type`**: `string` - 'Deposit' (client buys USDT) or 'Withdraw' (client sells USDT).
-   **`clientId`**: `string` - The ID of the client involved.
-   **`clientName`**: `string` - The name of the client (denormalized for display).
-   **`cryptoWalletId`**: `string` - The ID of the internal USDT wallet account used.
-   **`amount_usd`**: `number` - The total USD value of the cash part of the transaction.
-   **`fee_usd`**: `number` - The fee charged in USD.
-   **`amount_usdt`**: `number` - The final amount of USDT transferred.
-   **`status`**: `string` - The transaction status ('Pending', 'Confirmed', 'Cancelled').
-   **`linkedSmsId`**: `string` (optional) - A comma-separated list of IDs from `/modern_cash_records` that fund this transaction.
-   **`hash`**: `string` (optional) - The blockchain transaction hash.
-   **`client_wallet_address`**: `string` (optional) - The client's BEP20 address for the transfer.
-   **`notes`**: `string` (optional) - Any additional notes.
-   **`createdAt`**: `string` (ISO 8601) - The timestamp when the record was created.
-   ... and other optional fields for display or reference.

---

### 11. `/usdt_receipts/{recordId}`

A manually recorded receipt of USDT from a client.

-   **`id`**: `string` - The sequential record ID.
-   **`date`**: `string` (ISO 8601) - The date of the receipt.
-   **`clientId`**: `string`
-   **`clientName`**: `string`
-   **`cryptoWalletId`**: `string` - The system wallet that received the funds.
-   **`cryptoWalletName`**: `string`
-   **`amount`**: `number` - The amount of USDT received.
-   **`txid`**: `string` (optional) - The blockchain transaction hash.
-   **`walletAddress`**: `string` (optional) - The client's sending wallet address.
-   **`notes`**: `string` (optional)
-   **`status`**: `string` ('Completed', 'Cancelled')
-   **`createdAt`**: `string` (ISO 8601)

---

### 12. `/counters`

Stores atomic counters for generating sequential IDs.

-   **/`globalRecordId`**: `number` - The last used ID for any new financial record.
-   **/`modernCashRecordId`**: `number` - The last used ID for the modern cash records ledger.
-   **/`usdtRecordId`**: `number` - The last used ID for the modern USDT records ledger.
