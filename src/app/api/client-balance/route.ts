import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId') || '1003113';

    // Get client info
    const clientRef = ref(db, `clients/${clientId}`);
    const clientSnapshot = await get(clientRef);
    
    if (!clientSnapshot.exists()) {
      return Response.json({ error: 'Client not found' }, { status: 404 });
    }

    const client = clientSnapshot.val();
    const clientAccountId = `6000${clientId}`;

    // Get all journal entries
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    // Filter entries for this client account
    const entries = Object.entries(allJournals)
      .filter(([_, entry]: any) => 
        entry.debit_account === clientAccountId || entry.credit_account === clientAccountId
      )
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate balance
    let balance = 0;
    const breakdown: any[] = [];

    for (const entry of entries) {
      const previousBalance = balance;
      
      if (entry.debit_account === clientAccountId) {
        balance -= entry.debit_amount;
      } else if (entry.credit_account === clientAccountId) {
        balance += entry.credit_amount;
      }

      breakdown.push({
        date: entry.date,
        description: entry.description,
        balanceBefore: previousBalance,
        balanceAfter: balance,
        amount: entry.amount_usd || 0,
      });
    }

    return Response.json({
      clientId,
      clientName: client.name,
      clientAccountId,
      balance: balance.toFixed(2),
      totalEntries: entries.length,
      breakdown: breakdown.slice(-5),
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
