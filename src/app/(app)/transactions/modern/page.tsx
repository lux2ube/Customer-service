
import { PageHeader } from "@/components/page-header";
import { ModernTransactionForm } from "@/components/modern-transaction-form";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref } from "firebase/database";
import type { Client } from "@/lib/types";

async function getInitialClients(): Promise<Client[]> {
    const clientsRef = ref(db, 'clients');
    const snapshot = await get(clientsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}


export default async function ModernTransactionPage() {
    const clients = await getInitialClients();

    return (
        <>
            <PageHeader
                title="Modern Transaction"
                description="Create a new transaction by linking multiple financial records for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ModernTransactionForm initialClients={clients} />
            </Suspense>
        </>
    );
}
