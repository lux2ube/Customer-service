#!/usr/bin/env node

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, update } from 'firebase/database';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function updateTestClient() {
  try {
    console.log('🔍 Finding Test balance client...\n');

    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    const allClients = clientsSnapshot.val() || {};
    
    let testClientId = null;
    for (const [id, client] of Object.entries(allClients)) {
      if (client.name === 'Test balance') {
        testClientId = id;
        break;
      }
    }

    if (!testClientId) {
      console.log('❌ Test client "Test balance" not found!');
      process.exit(1);
    }

    console.log(`✅ Found test client ID: ${testClientId}\n`);

    const updateData = {
      [`clients/${testClientId}/name`]: 'Test balance - Terminal Updated',
      [`clients/${testClientId}/lastModified`]: new Date().toISOString(),
    };

    await update(ref(db), updateData);

    console.log('✅ Test client updated successfully!');
    console.log(`   Name: Test balance - Terminal Updated`);
    console.log(`   ID: ${testClientId}`);
    console.log(`   Updated at: ${new Date().toISOString()}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateTestClient();
