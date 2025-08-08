
import { PageHeader } from "@/components/page-header";
import { ServiceProviderForm } from "@/components/service-provider-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
        return allAccounts.filter(acc => !acc.isGroup && acc.currency);
    }
    return [];
}

export default async function AddServiceProviderPage() {
    const accounts = await getAccounts();

    return (
        <>
            <PageHeader
                title="Add Service Provider"
                description="Create a new group for your bank or crypto service accounts."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ServiceProviderForm accounts={accounts} />
            </Suspense>
        </>
    );
}
