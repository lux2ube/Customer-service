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

async function getClient(clientId: string): Promise<Client | null> {
    if (!clientId) return null;
    const clientRef = ref(db, `clients/${clientId}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id: clientId, ...snapshot.val() };
    }
    return null;
}

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
    const transaction = await getTransaction(params.id);

    if (!transaction) {
        notFound();
    }
    
    const client = await getClient(transaction.clientId);

    return (
        <>
            <PageHeader
                title="Edit Transaction"
                description={`Editing transaction ID: ${transaction.id}`}
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm transaction={transaction} client={client} />
            </Suspense>
        </>
    );
}
