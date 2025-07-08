
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Transaction, Client } from '@/lib/types';
import { notFound } from "next/navigation";

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

async function getClients(): Promise<Client[]> {
    const clientsRef = ref(db, 'clients');
    const snapshot = await get(clientsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
    const transaction = await getTransaction(params.id);

    if (!transaction) {
        notFound();
    }
    
    const client = transaction.clientId ? await getClient(transaction.clientId) : null;
    const clients = await getClients();

    return (
        <>
            <PageHeader
                title="Edit Transaction"
                description="Update the details of an existing transaction."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm transaction={transaction} client={client} clients={clients} />
            </Suspense>
        </>
    );
}
