# USDT Sync Field Mapping Guide

## Database Expectations (ModernUsdtRecord)

The database stores USDT transaction records with the following structure:

```
ModernUsdtRecord {
  id: string              // Auto-generated: USDT1, USDT2, USDT3, etc.
  date: string            // ISO 8601 format (e.g., "2024-11-29T10:30:45.000Z")
  type: 'inflow' | 'outflow'    // Determined by wallet address comparison
  source: 'BSCScan' | 'CSV' | 'Manual'  // Origin of transaction
  status: 'Confirmed' | 'Pending' | 'Used' | 'Cancelled'
  clientId: string | null         // Matched client ID or null
  clientName: string | null       // Matched client name or "Unassigned"
  accountId: string               // Linked wallet account ID
  accountName: string             // Wallet account display name
  amount: number                  // Amount in USDT (decimal)
  txHash: string                  // Transaction hash on blockchain
  clientWalletAddress: string     // The other party's wallet address
  notes: string                   // Transaction description
  createdAt: string               // Timestamp when record was created
  blockNumber: number             // Blockchain block number (optional)
}
```

---

## API Sync Field Mapping
### Etherscan V2 API → Database

| Etherscan API Field | Data Type | Processing | Database Field |
|---|---|---|---|
| `hash` | string | Used as-is | `txHash` |
| `blockNumber` | string | Parsed as integer | `blockNumber` |
| `timeStamp` | string (unix) | Converted to ISO: `new Date(parseInt(timestamp) * 1000).toISOString()` | `date` |
| `from` | string (address) | Lowercased | Source address (determines `type` & `clientWalletAddress`) |
| `to` | string (address) | Compared with walletAddress to determine incoming/outgoing | Destination address (determines `type` & `clientWalletAddress`) |
| `value` | string (wei) | Divided by 10^18 decimals, parsed as float | `amount` |

### Type Determination
```
if (tx.to.toLowerCase() === walletAddress.toLowerCase()) {
  type = 'inflow'
  clientWalletAddress = tx.from
} else {
  type = 'outflow'
  clientWalletAddress = tx.to
}
```

---

## CSV Sync Field Mapping
### CSV Columns → Database

Your CSV **MUST** have these exact column headers (case-insensitive):

| CSV Column Header | Data Type | Processing | Database Field |
|---|---|---|---|
| `Transaction Hash` | string | Trimmed, lowercased | `txHash` |
| `Blockno` | string | Parsed as integer | `blockNumber` |
| `UnixTimestamp` | string (unix) | Converted to ISO: `new Date(parseInt(timestamp) * 1000).toISOString()` | `date` |
| `From` | string (address) | Lowercased | Source address (determines `type` & `clientWalletAddress`) |
| `To` | string (address) | Compared with walletAddress to determine incoming/outgoing | Destination address (determines `type` & `clientWalletAddress`) |
| `TokenValue` | string (USDT) | Commas removed, parsed as float | `amount` |

### Type Determination (Same as API)
```
if (to.toLowerCase() === walletAddress) {
  type = 'inflow'
  clientWalletAddress = from
} else {
  type = 'outflow'
  clientWalletAddress = to
}
```

---

## CSV Format Example

```csv
Transaction Hash,Blockno,UnixTimestamp,DateTime (UTC),From,To,TokenValue,USDValueDayOfTx,ContractAddress,TokenName,TokenSymbol
0x123abc...,42000000,1701261045,2024-11-29 10:30:45,0xabcd1234...,0x5555...,100.5,100,0x55d398326f99059fF775485246999027B3197955,Tether USD,USDT
0x456def...,42000001,1701261100,2024-11-29 10:31:40,0x5555...,0xabcd1234...,50.25,50,0x55d398326f99059fF775485246999027B3197955,Tether USD,USDT
```

**Required Columns Only:**
- Transaction Hash
- Blockno
- UnixTimestamp
- From
- To
- TokenValue

**Other Columns:** Ignored but can be included from Etherscan exports

---

## Field-by-Field Processing Rules

### Amount (TokenValue) Processing
```
Minimum Amount: 0.01 USDT
- Transactions ≤ 0.01 USDT are skipped
- TokenValue is parsed directly as decimal (e.g., "100.5" → 100.5 USDT)
- No decimals conversion needed (Etherscan already provides USDT value)
```

### Date (UnixTimestamp) Processing
```
Input: Unix timestamp in seconds (e.g., "1701261045")
Conversion: new Date(parseInt(timestamp) * 1000).toISOString()
Output: ISO 8601 string (e.g., "2024-11-29T10:30:45.000Z")
```

### Client Matching
```
Process:
1. Extract clientWalletAddress (either from or to based on type)
2. Search database for existing client with matching wallet address
3. If found:
   - Set clientId and clientName
   - Create journal entry (double-entry accounting)
4. If not found:
   - Set clientId = null
   - Set clientName = "Unassigned"
   - No journal entry created
```

### Deduplication
```
CSV Processing: Tracks processed transaction hashes
- Skip duplicate hashes within same CSV upload
- Skip if hash already exists in database (from previous syncs)
```

---

## API vs CSV Differences

| Aspect | Etherscan API | CSV Upload |
|---|---|---|
| **Source Field** | `'BSCScan'` | `'CSV'` |
| **Status** | `'Confirmed'` | `'Confirmed'` |
| **Amount Format** | Wei (10^18 decimals) | Already USDT (decimal) |
| **Sync Logic** | Incremental (tracks lastSyncedBlock) | One-time batch import |
| **Notes** | `"Synced from {configName}"` | `"Synced from CSV: {configName}"` |

---

## Configuration Requirements

Both sync methods require:
1. **BSC API Configuration** with:
   - Wallet Address (your system wallet on BSC)
   - Linked Account (USDT wallet account ID for double-entry)
   - Configuration Name (for display/notes)

2. **CSV File** must contain required headers and data rows

---

## Validation Checks

All synced records pass through:
- ✅ Required header validation (both API and CSV)
- ✅ Minimum amount filter (skip if ≤ 0.01 USDT)
- ✅ Address validation (from, to must be valid addresses)
- ✅ Deduplication (by transaction hash)
- ✅ Client matching (automatic lookup by wallet address)
- ✅ Journal entry creation (if client is matched)

---

## Example: Complete Record Creation

### Input (CSV Row)
```
0xabc123..., 42000000, 1701261045, 2024-11-29 10:30:45, 0x1111..., 0x5555..., 100.5, 100, ...
```

### Processing
```
walletAddress = 0x5555...
from = 0x1111...
to = 0x5555...

→ to === walletAddress? YES
→ type = 'inflow'
→ clientWalletAddress = 0x1111...

Amount = 100.5 USDT > 0.01? YES
Date = new Date(1701261045 * 1000).toISOString() = "2024-11-29T10:30:45.000Z"

Client lookup: Find client with wallet 0x1111...
→ Found: Client ID "C123", Name "Ahmed Al-Rashid"
```

### Output (Database Record)
```json
{
  "id": "USDT42",
  "date": "2024-11-29T10:30:45.000Z",
  "type": "inflow",
  "source": "CSV",
  "status": "Confirmed",
  "clientId": "C123",
  "clientName": "Ahmed Al-Rashid",
  "accountId": "2000",
  "accountName": "BSC USDT Wallet",
  "amount": 100.5,
  "txHash": "0xabc123...",
  "clientWalletAddress": "0x1111...",
  "notes": "Synced from CSV: Main Wallet",
  "createdAt": "2024-11-29T10:35:22.000Z",
  "blockNumber": 42000000
}
```

### Journal Entry (Auto-Created)
```
Debit Account: 6000C123 (Client sub-account)
Credit Account: 2000 (BSC USDT Wallet)
Amount: 100.5 USDT
Description: "Synced USDT inflow from CSV: Main Wallet for Ahmed Al-Rashid"
Date: 2024-11-29T10:30:45.000Z
```
