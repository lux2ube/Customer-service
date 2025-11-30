# CLIENT FINANCIAL MANAGEMENT SYSTEM - USER GUIDE

**Version:** 1.0  
**Last Updated:** November 30, 2025

---

## TABLE OF CONTENTS

1. [Quick Start](#quick-start)
2. [Creating Clients](#creating-clients)
3. [Recording Financial Transactions](#recording-financial-transactions)
4. [Managing Client Balances](#managing-client-balances)
5. [Troubleshooting](#troubleshooting)
6. [FAQ](#faq)

---

## QUICK START

### Your System Flow

```
Client contacts via WhatsApp
    ↓
Client sends USDT or Cash
    ↓
You record the transaction
    ↓
System tracks: inflow → fee → outflow
    ↓
Client balance updated automatically
```

### Three Simple Steps

1. **Create a Client** - Add client details
2. **Record Inflow** - What client sent you (USDT or Cash)
3. **Create Transaction** - Link inflow + fee + outflow

---

## CREATING CLIENTS

### Step 1: Go to Client Creation
- Navigate to **Clients** → **Create New Client**

### Step 2: Enter Basic Information

| Field | Description | Required |
|-------|-------------|----------|
| **Client Name** | Full name (Arabic or English) | Yes |
| **Phone Number** | WhatsApp number | Yes |
| **Verification Status** | Approved/Pending | Yes |

### Step 3: Optional KYC Documents
You can add:
- Yemeni National ID (Front)
- Yemeni National ID (Back)
- Passport
- **System automatically extracts:**
  - Date of Birth
  - Blood Group
  - ID Number
  - Issue/Expiry Dates

### Step 4: Save
Click **"Create Client"** → System creates account and assigns unique ID

---

## RECORDING FINANCIAL TRANSACTIONS

### Overview

Your system handles TWO types of records:

**A. Cash Records** (Yemeni Riyal)
- Client sends you cash
- You record amount received
- Currency converts to USD automatically

**B. USDT Records** (Cryptocurrency)
- Client sends you USDT
- You record amount received
- Blockchain tracked

---

### Creating a Cash Record

**When:** Client sends you cash

**Steps:**

1. **Go to:** Financial Records → Create Cash Record
2. **Fill in:**
   - **Client Name** - Who sent it
   - **Amount** - How much YER received
   - **Bank Account** - Where you received it
   - **Transaction Type** - "Inflow" (they sent you)
3. **Status:** Automatically "Pending"
4. **Save**

**Example:**
```
Client: Ahmed Ali
Amount: 500,000 YER
Bank Account: KIB Account
Status: Pending ✓
```

---

### Creating a USDT Record

**When:** Client sends you USDT (blockchain)

**Steps:**

1. **Go to:** Financial Records → Create USDT Record
2. **Fill in:**
   - **Client Name** - Who sent it
   - **Amount** - How much USDT
   - **Wallet** - Your receiving wallet
   - **Tx Hash** - Blockchain transaction ID (for verification)
   - **Client Wallet** - Their wallet address (optional, system remembers)
3. **Status:** Automatically "Pending"
4. **Save**

**Example:**
```
Client: Mohamed Hassan
Amount: 500 USDT
Your Wallet: Binance Account
Tx Hash: 0x1234...
Status: Pending ✓
```

---

## MANAGING CLIENT BALANCES

### Complete Transaction Flow

After recording inflow (cash/USDT), you need to complete the transaction:

#### Step 1: Edit Client Profile
- Go to **Clients** → Select client → **Edit**

#### Step 2: Create Transaction
- Tab: **Financial Records**
- Shows all "Pending" records for this client
- **Select records** you want to finalize

#### Step 3: Transaction Details

| Item | What It Means | Example |
|------|---------------|---------|
| **Total Inflow** | What client sent | $500 |
| **Total Outflow** | What you send back | $450 |
| **Fee** | Your commission | $50 |
| **Difference** | Variance (if any) | $0 |

#### Step 4: Complete Transaction

**Flow:**
```
Client Record: Sent 500 USDT
  ↓
Inflow recorded: +500 USD
  ↓
Fee charged: -50 USD
  ↓
Outflow sent: -450 USD
  ↓
Balance settled: 0 (complete)
```

**System automatically:**
- ✓ Marks records as "Used" (won't show again)
- ✓ Updates client balance in journal
- ✓ Prevents duplicate transactions
- ✓ Records all fees charged

#### Step 5: Verify Completion

Check: Records disappear from "Pending" list → **Transaction successful**

---

## MANAGING CLIENT BALANCES

### View Client Balance

**Location:** Clients → Select Client → View Profile

**Shows:**
- **Current Balance** - What client owes or is owed
- **Inflows** - Total received from client
- **Outflows** - Total sent to client
- **Fees** - Total commission charged
- **Status** - Reconciled/Settled

**Example:**
```
Client: Ahmed Ali
Total Received: $1,000
Total Sent: $900
Total Fees: $100
Current Balance: $0 (Settled) ✓
```

---

### Balance Scenarios

#### Scenario 1: Client Overpaid (Balance > 0)
```
Received: $1,000
Sent Back: $800
Fee: $100
Balance: $100 (You owe client)

Action: Send $100 to client or credit future transactions
```

#### Scenario 2: Client Underpaid (Balance < 0)
```
Received: $800
Sent Back: $900
Fee: $50
Balance: -$50 (Client owes you)

Action: Request $50 from client before next transaction
```

#### Scenario 3: Perfectly Settled (Balance = 0)
```
Received: $1,000
Sent Back: $900
Fee: $100
Balance: $0 (Complete) ✓
```

---

### Understanding Balance Status

| Status | Meaning | Action |
|--------|---------|--------|
| **Reconciled** | All transactions matched and verified | None needed |
| **Variance** | Small discrepancy detected | Review and reconcile |
| **Unreconciled** | Transactions don't match exactly | Check records |

---

## TROUBLESHOOTING

### Problem: Records Still Show After Transaction

**Cause:** Transaction may not have been saved properly

**Solution:**
1. Refresh page (F5)
2. Go back to client profile
3. Records should be gone if transaction succeeded

**Check:** Look for success message after clicking "Create Transaction"

---

### Problem: Balance Not Updated

**Cause:** 
- Transaction not fully created
- Journal entry not posted
- Browser cache issue

**Solution:**
1. Refresh page (Ctrl+F5 or Cmd+Shift+R)
2. Go to **Accounting** → **Journal** 
3. Look for recent entries with client name
4. Check if balance reflects the transaction

**Verify:** Try opening client profile in new tab

---

### Problem: Can't Select Records

**Cause:** Records may already be marked as "Used"

**Solution:**
- Records that are already used don't appear in the list
- Only "Pending" status records can be selected
- If you need to redo a transaction:
  - Contact support
  - They can reset record status if needed

---

### Problem: Transaction Fee Incorrect

**Cause:** Fee percentage may not match your rate

**Solution:**
1. Check your fee setup in system settings
2. Verify: Is fee a percentage or flat amount?
3. Recalculate manually:
   - Fee = Inflow × Fee%
   - Example: $1,000 × 5% = $50 fee

**If wrong:** Contact support to adjust fee structure

---

### Problem: Exchange Rate Wrong

**Cause:** YER/USD rate may not be current

**Solution:**
1. Check current market rate (XE.com or Google)
2. Contact support if rate needs updating
3. All conversions use system's rate at time of record creation
4. Rate is locked once record created

**Example:**
```
If you recorded: 500,000 YER = $400
And current rate is different...
Rate is locked at creation time, cannot change retroactively
```

---

## FAQ

### Q: What if a client sends partial payment?

**A:** Record it as a separate record and fee:

```
Client sends: 300 USDT (partial)
Create USDT Record: 300 USDT inflow
Later, create transaction with:
  - 300 inflow
  - Fee (e.g., 15 USDT)
  - Send 285 back

Balance now: -$15 (client still owes if this was final)
```

---

### Q: Can I combine multiple records in one transaction?

**A:** Yes! Select multiple records:

```
Record 1: 300 USDT inflow
Record 2: 200,000 YER inflow
Create Transaction: Combines both

Total Inflow: 300 USDT + $800 YER = $1,100
Fee: 10% = $110
Send back: $990
```

---

### Q: What if I made a mistake in a transaction?

**A:** Records are locked after transaction created.

**Options:**
1. Contact support for reversal
2. Create opposite transaction (reverse entry)
3. Document issue for next transaction

**Prevent this:** Always verify before clicking "Create Transaction"

---

### Q: How do I track profit from fees?

**A:** 

**Location:** Accounting → Financial Reports

**View:**
- Total fees collected
- Fee income vs. transactions
- Profit margin per client

**Example:**
```
Month Total:
  Transactions: 20
  Total Inflows: $10,000
  Total Fees: $1,000 (10% margin)
  Your Profit: $1,000
```

---

### Q: Can I edit a record after creating it?

**A:** 

**Before Transaction:**
- ✓ Can edit "Pending" records
- Click record → Edit button

**After Transaction:**
- ✗ Cannot edit "Used" records
- Must contact support for reversal

**Tip:** Review records carefully before creating transaction

---

### Q: How long are records kept?

**A:** 

- **All records:** Kept permanently for audit trail
- **Visible records:** Only "Pending" records show for new transactions
- **Used records:** Hidden from transaction form but still in system history

---

### Q: What if client disputes their balance?

**A:** 

**Steps:**
1. Go to **Accounting** → **Journal Entries**
2. Filter by client name
3. Show all entries affecting their account
4. Each entry shows: date, amount, type
5. Print/export for client proof

**All transactions fully documented** ✓

---

### Q: How do I handle currency conversions?

**A:** System handles automatically:

```
YER to USD: Uses current market rate
  500,000 YER → $400 USD (at recorded rate)

USDT: Always 1 USDT = $1 USD (stable coin)

Your Wallet: Multi-currency supported
  - Bank Account: YER or USD
  - Crypto Wallet: USDT
```

**Rate locked at:** Time of record creation

---

### Q: Can multiple people use this system?

**A:** 

**Current:** Single user (you)

**Future:** Support team access
- Contact support to add accounts
- Each user gets separate login
- All transactions logged with user who created them

---

### Q: How secure is client data?

**A:**

**Security includes:**
- ✓ Encrypted database
- ✓ Secure login required
- ✓ All changes logged (audit trail)
- ✓ No accidental deletions
- ✓ Backup automatic daily

**Data Protection:**
- Phone numbers: Encrypted
- Transaction amounts: Encrypted
- Account balances: Reconciled and verified

---

### Q: What if the system crashes?

**A:**

**Automatic protection:**
- ✓ All data saved to database (not lost)
- ✓ System auto-recovers on restart
- ✓ Open any incomplete transactions → They resume
- ✓ Balances always accurate from journal

**You lose nothing** - continue where you left off

---

## QUICK REFERENCE

### Menu Navigation

**Clients**
- View all clients
- Create new client
- Edit client profile
- View client balance

**Financial Records**
- Create Cash Record
- Create USDT Record
- View all records
- Track record status

**Transactions**
- View all transactions
- Edit client to create transaction
- See transaction details

**Accounting**
- View journal entries
- Financial reports
- Balance reports
- Audit trail

---

### Important Statuses

| Status | Meaning | Next Action |
|--------|---------|-------------|
| **Pending** | Record created, waiting to use | Create transaction |
| **Used** | Linked to transaction | Check balance updated |
| **Reconciled** | Transaction complete and verified | None - settled |

---

### Key Shortcuts

- **Client Profile Edit** → Create transaction
- **Financial Records** → Quick record creation
- **Accounting Journal** → Verify all entries
- **Reports** → See totals and summaries

---

## GETTING HELP

### Common Issues & Quick Fixes

**Records disappear after transaction?**
→ This is normal! They're marked "Used" and hidden

**Balance not showing?**
→ Refresh page (Ctrl+F5) and check accounting journal

**Transaction won't create?**
→ Check that you selected at least one record

**Fee calculation wrong?**
→ Verify your fee percentage in settings

**Exchange rate outdated?**
→ Contact support to update YER/USD rate

---

## BEST PRACTICES

### ✓ DO:

- Review all amounts before creating transaction
- Check client balance after each transaction
- Keep transaction notes for disputes
- Reconcile monthly
- Backup account information
- Update fees regularly

### ✗ DON'T:

- Create transaction without selecting records
- Edit records after they're "Used"
- Trust only displayed numbers (always verify with journal)
- Leave transactions incomplete
- Share login credentials
- Manually delete records (system handles cleanup)

---

## SUCCESS CHECKLIST

When completing a transaction:

- [ ] Client selected
- [ ] Records show correct amounts
- [ ] Fee is accurate
- [ ] Total inflow/outflow calculated correctly
- [ ] Transaction type selected ("Transfer")
- [ ] Clicked "Create Transaction"
- [ ] See success message
- [ ] Refresh page and records are gone
- [ ] Check journal has entries
- [ ] Verify balance updated

✓ **All checked? Transaction is complete!**

---

## NEXT STEPS

1. **Create Your First Client** - Add basic info
2. **Record Your First Transaction** - Practice with small amount
3. **Verify Balance** - Check system calculated correctly
4. **Review Journal** - Understand complete entry details
5. **Reconcile Manually** - Compare system total vs. your records

---

**For technical support or questions:** Contact system administrator

**Document Version:** 1.0  
**Last Updated:** November 30, 2025  
**Status:** READY FOR PRODUCTION USE ✓
