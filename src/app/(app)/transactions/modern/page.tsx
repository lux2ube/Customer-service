
import { PageHeader } from "@/components/page-header";
import { ModernTransactionForm } from "@/components/modern-transaction-form";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref } from "firebase/database";
import type { Client, Account, ServiceProvider } from "@/lib/types";

async function getPageData(): Promise<{ clients: Client[], usdtAccounts: Account[], serviceProviders: ServiceProvider[] }> {
    const clientsRef = ref(db, 'clients');
    const accountsRef = ref(db, 'accounts');
    const providersRef = ref(db, 'service_providers');
    
    const [clientsSnapshot, accountsSnapshot, providersSnapshot] = await Promise.all([
        get(clientsRef),
        get(accountsRef),
        get(providersRef)
    ]);

    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        clients.push(...Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }

    const usdtAccounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const allAccounts: Record<string, Account> = accountsSnapshot.val();
        for (const id in allAccounts) {
            if (!allAccounts[id].isGroup && allAccounts[id].currency === 'USDT') {
                usdtAccounts.push({ id, ...allAccounts[id] });
            }
        }
    }
    
    const serviceProviders: ServiceProvider[] = [];
    if (providersSnapshot.exists()) {
        const data = providersSnapshot.val();
        serviceProviders.push(...Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }

    return { clients, usdtAccounts, serviceProviders };
}


export default async function ModernTransactionPage() {
    const { clients, usdtAccounts, serviceProviders } = await getPageData();

    return (
        <>
            <PageHeader
                title="Modern Transaction"
                description="Create a new transaction by linking multiple financial records for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ModernTransactionForm 
                    initialClients={clients} 
                    usdtAccounts={usdtAccounts}
                    serviceProviders={serviceProviders}
                />
            </Suspense>
        </>
    );
}
