
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account } from '@/lib/types';
import { notFound } from "next/navigation";

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
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

    return (
        <>
            <PageHeader
                title="Edit Client"
                description="Update the client's profile details."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ClientForm client={client} bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
