# CSV USDT Sync - Quick Guide

## What the Database Expects

Your **ModernUsdtRecord** database expects these 11 core fields:

```
id              → Auto-generated (USDT1, USDT2, USDT3...)
date            → ISO 8601 format (e.g., "2024-11-29T10:30:45.000Z")
type            → "inflow" or "outflow" (auto-determined by wallet comparison)
source          → "CSV" (for CSV uploads)
status          → "Confirmed" (all synced records are confirmed)
amount          → Decimal USDT (e.g., 100.5)
txHash          → Transaction hash from blockchain
clientWalletAddress → The other party's wallet address
accountId       → Your wallet account ID (from BSC API config)
accountName     → Your wallet account name
clientId        → Matched client ID or null if unassigned
clientName      → Matched client name or "Unassigned"
createdAt       → Timestamp when record was created
notes           → Auto-filled with sync source info
```

---

## CSV Format Required

### Required Columns (Case-Insensitive)
Your CSV **must** have these exact headers (order doesn't matter):
- `Transaction Hash` → becomes `txHash`
- `Blockno` → becomes `blockNumber`
- `UnixTimestamp` → becomes `date` (converted to ISO 8601)
- `From` → source wallet address
- `To` → destination wallet address
- `TokenValue` → becomes `amount` (already in USDT, not wei)

### Field Processing
| CSV Field | Processing | Example | Database Field |
|---|---|---|---|
| Transaction Hash | Used as-is | 0xabc123... | txHash |
| Blockno | Parsed as integer | 42000000 | blockNumber |
| UnixTimestamp | Seconds → ISO date | 1701261045 | date → "2024-11-29T10:30:45Z" |
| From | Lowercased | 0x1111... | Source address |
| To | Lowercased | 0x5555... | Destination address |
| TokenValue | Decimal parsed | 100.5 | amount → 100.5 USDT |

### Example CSV
```csv
Transaction Hash,Blockno,UnixTimestamp,From,To,TokenValue
0xabc123def456,42000000,1701261045,0x1111111111111111111111111111111111111111,0x5555555555555555555555555555555555555555,100.5
0x789ghi012jkl,42000001,1701261100,0x5555555555555555555555555555555555555555,0x1111111111111111111111111111111111111111,50.25
```

---

## How Type & Wallet Address Are Determined

The system **auto-detects** whether each transaction is an inflow or outflow:

```
Your Wallet Address: 0x5555...

If CSV "To" address = 0x5555... → INFLOW
  - Other party's address (From): becomes clientWalletAddress
  - Money flowing IN to your wallet
  - Debit: Client account, Credit: Your wallet account

If CSV "From" address = 0x5555... → OUTFLOW
  - Other party's address (To): becomes clientWalletAddress
  - Money flowing OUT from your wallet
  - Debit: Your wallet account, Credit: Client account
```

---

## Client Matching

After syncing, the system automatically looks up if any **existing client** has the `clientWalletAddress`:

### If Client Found ✅
- `clientId` = Matched client ID
- `clientName` = Matched client name
- **Journal entry created automatically** (double-entry accounting)
- Client receives notification of transaction

### If Client Not Found ❌
- `clientId` = null
- `clientName` = "Unassigned"
- **No journal entry created**
- Record stored for later manual reconciliation

---

## Validation Rules

All records pass through these checks:

✅ **Required Headers** - All 6 columns must be present (case-insensitive)
✅ **Amount Filter** - Transactions ≤ 0.01 USDT are skipped (dust filter)
✅ **Data Validation** - From, To, Hash must be non-empty
✅ **Deduplication** - Same transaction hash not processed twice
✅ **Wallet Validation** - From/To must look like valid addresses

---

## How to Use

1. **Set up BSC API Configuration**
   - Go to USDT Records → Configuration
   - Add wallet address
   - Link to USDT account
   - Save configuration name

2. **Export CSV from Etherscan**
   - Go to https://etherscan.io/ (for BSC: bscscan.com)
   - Search your wallet address
   - Find token transfers (USDT)
   - Export as CSV

3. **Upload CSV**
   - Go to USDT Records → "Upload & Sync CSV"
   - Select the BSC API configuration
   - Upload your CSV file
   - Click "Upload & Sync CSV"

4. **Review Results**
   - Toast shows: synced count + skipped count
   - Records appear in USDT Records table
   - Journal entries auto-created for matched clients

---

## Troubleshooting

### "CSV is missing required columns: ..."
**Problem:** Column names don't match exactly
**Solution:** Ensure your CSV has exactly these columns:
- Transaction Hash
- Blockno
- UnixTimestamp
- From
- To
- TokenValue

### "No new transactions synced"
**Possible causes:**
- All transactions filtered out (≤ 0.01 USDT)
- Duplicate hashes already in database
- CSV has wrong wallet addresses

### "Unassigned" records
**Expected behavior:** Clients without matching wallet address in system
**Solution:** Add client's wallet address to client profile to match future transactions

---

## Data Integrity

✅ **No data loss** - CSV import is atomic (all or nothing)
✅ **Deduplication** - Duplicate hashes never processed twice
✅ **Audit trail** - All changes logged in journal entries
✅ **Client linkage** - Automatic matching with existing clients
✅ **Amount accuracy** - No manual decimals conversion needed
