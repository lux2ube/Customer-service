import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export async function GET() {
  try {
    // Get client
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClient = null;
    for (const [id, client] of Object.entries(allClients)) {
      if ((client as any).name.includes('Test balance')) {
        testClient = { id, ...(client as any) };
        break;
      }
    }

    if (!testClient) {
      return Response.json({ error: 'Test client not found' }, { status: 404 });
    }

    const clientAccountId = `6000${testClient.id}`;

    // Get ALL journal entries
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    // All entries related to this client in ANY way
    const allRelated = Object.entries(allJournals)
      .filter(([_, entry]: any) => {
        const desc = (entry?.description || '').toString();
        return desc.includes(testClient.id) || 
               desc.includes('Test balance') ||
               entry?.debit_account === clientAccountId ||
               entry?.credit_account === clientAccountId ||
               entry?.debit_account === testClient.id ||
               entry?.credit_account === testClient.id;
      })
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // All 7001 entries
    const all7001 = Object.entries(allJournals)
      .filter(([_, entry]: any) => entry.debit_account === '7001' || entry.credit_account === '7001')
      .map(([id, entry]: any) => ({ id, ...entry }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    // Count entries with this account
    const directEntries = Object.entries(allJournals)
      .filter(([_, entry]: any) => entry.debit_account === clientAccountId || entry.credit_account === clientAccountId)
      .map(([id, entry]: any) => ({ id, ...entry }));

    // Calculate balance from direct entries
    let balance = 0;
    for (const entry of directEntries) {
      if (entry.debit_account === clientAccountId) {
        balance -= entry.debit_amount;
      } else if (entry.credit_account === clientAccountId) {
        balance += entry.credit_amount;
      }
    }

    return Response.json({
      clientId: testClient.id,
      clientName: testClient.name,
      clientAccountId,
      directBalance: balance.toFixed(2),
      directEntriesCount: directEntries.length,
      directEntries: directEntries.slice(-5),
      relatedEntriesCount: allRelated.length,
      recentRelatedEntries: allRelated.slice(0, 10),
      recentUnmatchedEntries: all7001,
      totalJournalEntries: Object.keys(allJournals).length,
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
