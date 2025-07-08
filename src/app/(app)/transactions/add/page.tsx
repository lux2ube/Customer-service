
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client } from '@/lib/types';

async function getClients(): Promise<Client[]> {
    const clientsRef = ref(db, 'clients');
    const snapshot = await get(clientsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}

export default async function AddTransactionPage() {
    const clients = await getClients();
    return (
        <>
            <PageHeader
                title="Add Transaction"
                description="Record a new financial transaction manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm clients={clients} />
            </Suspense>
        </>
    );
}
