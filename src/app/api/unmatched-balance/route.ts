import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET() {
  try {
    // Get all journal entries
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    // Calculate 7001 balance
    let balance7001 = 0;
    const entries7001: any[] = [];

    for (const [id, entry] of Object.entries(allJournals)) {
      if (entry && typeof entry === 'object') {
        const e = entry as any;
        if (e.debit_account === '7001' || e.credit_account === '7001') {
          if (e.debit_account === '7001') {
            balance7001 -= (e.debit_amount || 0);
          } else if (e.credit_account === '7001') {
            balance7001 += (e.credit_amount || 0);
          }
          entries7001.push({
            id,
            date: e.date,
            description: e.description,
            debit: e.debit_account,
            credit: e.credit_account,
            amount: e.amount_usd,
          });
        }
      }
    }

    // Sort by date
    entries7001.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return Response.json({
      account: '7001 - Unmatched Cash',
      balance: balance7001.toFixed(2),
      entriesCount: entries7001.length,
      recentEntries: entries7001.slice(0, 10)
    });

  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
