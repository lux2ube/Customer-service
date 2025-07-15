
import { PageHeader } from "@/components/page-header";
import { ClientMergeView } from "@/components/client-merge-view";
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


export default async function MergeClientsPage() {
    const clients = await getClients();

    return (
        <>
            <PageHeader
                title="Merge Duplicate Clients"
                description="Review clients with identical names and merge them into a single record."
            />
            <Suspense fallback={<div>Loading clients...</div>}>
               <ClientMergeView clients={clients} />
            </Suspense>
        </>
    );
}
