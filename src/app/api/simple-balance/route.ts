import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET() {
  try {
    const clientId = '1003113';
    const clientAccountId = `6000${clientId}`;

    // Get all journal entries
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    // Count entries for this account
    let entriesForClient = 0;
    let balance = 0;
    const entries: any[] = [];

    for (const [id, entry] of Object.entries(allJournals)) {
      if (entry && typeof entry === 'object') {
        const e = entry as any;
        if (e.debit_account === clientAccountId || e.credit_account === clientAccountId) {
          entriesForClient++;
          if (e.debit_account === clientAccountId) {
            balance -= (e.debit_amount || 0);
          } else if (e.credit_account === clientAccountId) {
            balance += (e.credit_amount || 0);
          }
          entries.push({
            id,
            date: e.date,
            description: e.description,
            debit: e.debit_account,
            credit: e.credit_account,
            amount: e.amount_usd,
            balance_after: balance
          });
        }
      }
    }

    return Response.json({
      clientId,
      accountId: clientAccountId,
      balance: balance.toFixed(2),
      entriesCount: entriesForClient,
      entries: entries.slice(-5)
    });

  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
