import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET() {
  try {
    // Get all accounts
    const accountsRef = ref(db, 'accounts');
    const accountsSnapshot = await get(accountsRef);
    const allAccounts = accountsSnapshot.val() || {};

    // Get test client
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClient = null;
    for (const [id, client] of Object.entries(allClients)) {
      if ((client as any).name === 'Test balance') {
        testClient = { id, ...(client as any) };
        break;
      }
    }

    if (!testClient) {
      return Response.json({ error: 'Test client not found' }, { status: 404 });
    }

    const clientAccountId = `6000${testClient.id}`;

    // Get all journal entries
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    // Filter entries for 7001
    const entriesFor7001 = Object.entries(allJournals)
      .filter(([_, entry]: any) => entry.debit_account === '7001' || entry.credit_account === '7001')
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Filter entries for client
    const entriesForClient = Object.entries(allJournals)
      .filter(([_, entry]: any) => entry.debit_account === clientAccountId || entry.credit_account === clientAccountId)
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Filter transfer entries (7001 to client)
    const transferEntries = Object.entries(allJournals)
      .filter(([_, entry]: any) => 
        (entry.debit_account === '7001' && entry.credit_account === clientAccountId) ||
        (entry.debit_account === clientAccountId && entry.credit_account === '7001')
      )
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate balances
    const balance7001 = entriesFor7001.reduce((acc: number, entry: any) => {
      const change = entry.credit_account === '7001' ? entry.credit_amount : -entry.debit_amount;
      return acc + change;
    }, 0);

    const balanceClient = entriesForClient.reduce((acc: number, entry: any) => {
      const change = entry.credit_account === clientAccountId ? entry.credit_amount : -entry.debit_amount;
      return acc + change;
    }, 0);

    return Response.json({
      test_client: testClient,
      client_account_id: clientAccountId,
      balances: {
        '7001_unmatched_cash': balance7001,
        [clientAccountId]: balanceClient,
      },
      journal_entries: {
        entries_for_7001_count: entriesFor7001.length,
        entries_for_client_count: entriesForClient.length,
        transfer_entries_count: transferEntries.length,
        recent_transfers: transferEntries.slice(0, 5),
        recent_7001_entries: entriesFor7001.slice(-3),
        recent_client_entries: entriesForClient.slice(-3),
      },
      summary: {
        '7001_balance': balance7001.toFixed(2),
        'client_balance': balanceClient.toFixed(2),
        'total_entries_in_journal': Object.keys(allJournals).length,
      }
    });

  } catch (error) {
    console.error('Test error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
