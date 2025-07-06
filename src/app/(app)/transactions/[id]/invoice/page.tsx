
import { Invoice } from '@/components/invoice';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Transaction, Client } from '@/lib/types';
import { notFound } from 'next/navigation';

async function getTransaction(id: string): Promise<Transaction | null> {
    const transactionRef = ref(db, `transactions/${id}`);
    const snapshot = await get(transactionRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
    const transaction = await getTransaction(params.id);

    if (!transaction) {
        notFound();
    }
    
    const client = transaction.clientId ? await getClient(transaction.clientId) : null;

    if (!client) {
        notFound();
    }

    return (
        <Invoice transaction={transaction} client={client} />
    );
}

    