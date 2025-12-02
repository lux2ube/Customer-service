import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { assignRecordToClient } from '@/lib/actions/financial-records';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recordId, recordType } = body;

    if (!recordId || !recordType) {
      return Response.json({ error: 'Missing recordId or recordType' }, { status: 400 });
    }

    // Get the test client
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClientId = null;
    for (const [id, client] of Object.entries(allClients)) {
      testClientId = id; // Use first client found
      break;
    }

    if (!testClientId) {
      return Response.json({ error: 'No clients found' }, { status: 404 });
    }

    console.log(`\n🔄 TEST ASSIGN: Record ${recordId} (${recordType}) → Client ${testClientId}`);

    // Check record BEFORE
    const recordRefBefore = recordType === 'cash'
      ? ref(db, `cash_records/${recordId}`)
      : ref(db, `modern_usdt_records/${recordId}`);
    const recordBefore = await get(recordRefBefore);
    const beforeData = recordBefore.val();

    console.log(`Before assignment:
    clientId: ${beforeData?.clientId || 'NULL'}
    status: ${beforeData?.status}
    amount: ${recordType === 'cash' ? beforeData?.amountusd : beforeData?.amount}`);

    // CALL THE ASSIGN FUNCTION
    const result = await assignRecordToClient(recordId, recordType as 'cash' | 'usdt', testClientId);

    console.log(`\nAssignment result: ${JSON.stringify(result)}`);

    // Check record AFTER
    const recordRefAfter = recordType === 'cash'
      ? ref(db, `cash_records/${recordId}`)
      : ref(db, `modern_usdt_records/${recordId}`);
    const recordAfter = await get(recordRefAfter);
    const afterData = recordAfter.val();

    console.log(`After assignment:
    clientId: ${afterData?.clientId || 'NULL'}
    status: ${afterData?.status}`);

    // Check 7001 balance
    const journalRef = ref(db, 'journal_entries');
    const journalSnapshot = await get(journalRef);
    const allJournals = journalSnapshot.val() || {};

    let balance7001 = 0;
    let transferCount = 0;

    for (const [_, entry] of Object.entries(allJournals)) {
      if (entry && typeof entry === 'object') {
        const e = entry as any;
        if (e.debit_account === '7001' || e.credit_account === '7001') {
          if (e.debit_account === '7001') {
            balance7001 -= (e.debit_amount || 0);
          } else if (e.credit_account === '7001') {
            balance7001 += (e.credit_amount || 0);
          }
        }
        if (e.debit_account === '7001' && e.credit_account === `6000${testClientId}`) {
          transferCount++;
        }
      }
    }

    console.log(`\nJournal state:
    7001 balance: $${balance7001.toFixed(2)}
    Transfer entries: ${transferCount}`);

    return Response.json({
      success: true,
      assignment: result,
      before: { clientId: beforeData?.clientId, status: beforeData?.status },
      after: { clientId: afterData?.clientId, status: afterData?.status },
      journal: { balance7001, transferCount }
    });

  } catch (error) {
    console.error('❌ Test error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
