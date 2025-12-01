# ✅ STANDARDIZED FINANCIAL TERMINOLOGY

All financial records (Cash Records, USDT Records, Transactions) use consistent terminology:

## Status Field (Required - Affects Journal)

**Note: All records are CONFIRMED by default when created - automatically journaled!**

- **Pending** (DEPRECATED - no longer used)
  - Previously used for records not yet journaled
  - All records now confirm immediately on creation
  
- **Confirmed** (DEFAULT)
  - Record added to journal
  - AFFECTS balances immediately
  - Unassigned → Account 7000 (liability)
  - Assigned → Client account 6000{clientId}
  - Can be transitioned to: Cancelled
  
- **Cancelled**
  - Record was confirmed but now reversed
  - Creates REVERSE journal entry to undo confirmed entry
  - Permanently locked from further changes
  
- **Used**
  - Record cannot be used for transactions anymore
  - Locked status (no transitions out)
  - Prevents record reuse in transactions

## Matched / Assigned (Boolean via ClientId)
Use **clientId presence** to determine matched/assigned state:

- **Unassigned** = `clientId === null`
  - Record not matched to any client
  - When confirmed → Journal entry to Account 7000
  - Can be assigned later
  
- **Assigned** = `clientId !== null`
  - Record matched to specific client
  - When confirmed → Journal entry to client account 6000{clientId}
  - If was unassigned+confirmed before assignment:
    - Reversing entry removes from 7000
    - New entry adds to client account

## Key Relationships

```
Record Lifecycle:

1. Create → Pending, Unassigned (clientId = null)
2. Confirm → Status = Confirmed
   - If unassigned: Journal → 7000
   - If assigned: Journal → 6000{clientId}
3. Assign (if was unassigned) → Transfer: 7000 → 6000{clientId}
4. Optional: Cancel → Reverse journal entries
5. Optional: Mark as Used → Locked from reuse
```

## Field Mapping

| Concept | Field | Values |
|---------|-------|--------|
| Journal Impact | `status` | Pending, Confirmed, Cancelled, Used |
| Assigned to Client | `clientId` | null (unassigned) or client ID |
| Client Name | `clientName` | null or client name |

## Database Account Structure

- **7000** = Unassigned Receipts/Payments (temporary)
- **6000{clientId}** = Client Liability Account (e.g., 60001001910)
- **Bank/Wallet Accounts** = Assets

## Important Notes

- No "Matched" status exists - use clientId presence instead
- Assignment is independent from confirmation
- Can assign before confirming (will journal when confirmed)
- Can confirm without assigning (goes to 7000 until assigned)
- "Used" status is final - no transitions out
