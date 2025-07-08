
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account, Transaction } from '@/lib/types';
import { notFound } from "next/navigation";

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getClientTransactions(clientId: string): Promise<Transaction[]> {
    const transactionsRef = ref(db, 'transactions');
    const snapshot = await get(transactionsRef);
    if (!snapshot.exists()) {
        return [];
    }
    const allTransactions: Transaction[] = Object.values(snapshot.val());
    // Filter for transactions that are confirmed and belong to the specific client
    return allTransactions.filter(tx => tx.clientId === clientId && tx.status === 'Confirmed');
}

async function getBankAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
        return allAccounts.filter(acc => 
            !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'
        );
    }
    return [];
}


export default async function EditClientPage({ params }: { params: { id: string } }) {
    const client = await getClient(params.id);

    if (!client) {
        notFound();
    }

    const bankAccounts = await getBankAccounts();
    const transactions = await getClientTransactions(params.id);

    return (
        <>
            <PageHeader
                title="Edit Client"
                description="Update the client's profile details."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ClientForm client={client} bankAccounts={bankAccounts} transactions={transactions} />
            </Suspense>
        </>
    );
}
