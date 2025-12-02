import { db } from '@/lib/firebase';
import { ref, get, update } from 'firebase/database';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newName = body.name || 'Test balance - Updated';

    // Find test client
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClientId = null;
    for (const [id, client] of Object.entries(allClients)) {
      if ((client as any).name === 'Test balance') {
        testClientId = id;
        break;
      }
    }

    if (!testClientId) {
      return Response.json({ error: 'Test client not found' }, { status: 404 });
    }

    // Update client
    const updateData = {
      [`clients/${testClientId}/name`]: newName,
      [`clients/${testClientId}/lastModified`]: new Date().toISOString(),
    };

    await update(ref(db), updateData);

    return Response.json({
      success: true,
      clientId: testClientId,
      newName: newName,
      message: `Test client updated successfully`
    });

  } catch (error) {
    console.error('Error updating test client:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
