
import { PageHeader } from "@/components/page-header";
import { ServiceProviderForm } from "@/components/service-provider-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, ServiceProvider } from '@/lib/types';
import { notFound } from "next/navigation";

async function getAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
        return allAccounts.filter(acc => !acc.isGroup && acc.currency);
    }
    return [];
}

async function getServiceProvider(id: string): Promise<ServiceProvider | null> {
    const providerRef = ref(db, `service_providers/${id}`);
    const snapshot = await get(providerRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

export default async function EditServiceProviderPage({ params }: { params: { id: string } }) {
    const accounts = await getAccounts();
    const provider = await getServiceProvider(params.id);

    if (!provider) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit Service Provider"
                description="Update the details for this provider group."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ServiceProviderForm provider={provider} accounts={accounts} />
            </Suspense>
        </>
    );
}
