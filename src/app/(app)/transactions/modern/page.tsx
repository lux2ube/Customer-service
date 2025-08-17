
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { ModernTransactionForm } from "@/components/modern-transaction-form";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref, onValue } from "firebase/database";
import type { Client, Account, ServiceProvider } from "@/lib/types";

async function getPageData(): Promise<{ clients: Client[], allAccounts: Account[], serviceProviders: ServiceProvider[] }> {
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

    const allAccounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const allAccountsData: Record<string, Account> = accountsSnapshot.val();
        for (const id in allAccountsData) {
            allAccounts.push({ id, ...allAccountsData[id] });
        }
    }
    
    const serviceProviders: ServiceProvider[] = [];
    if (providersSnapshot.exists()) {
        const data = providersSnapshot.val();
        serviceProviders.push(...Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }

    return { clients, allAccounts, serviceProviders };
}


function FormLoader() {
    const [data, setData] = React.useState<{
        clients: Client[];
        allAccounts: Account[];
        serviceProviders: ServiceProvider[];
        defaultRecordingAccountId: string;
    } | null>(null);

    React.useEffect(() => {
        const fetchData = async () => {
            const pageData = await getPageData();
            
            const settingRef = ref(db, 'settings/wallet/defaultRecordingAccountId');
            const unsub = onValue(settingRef, (snapshot) => {
                 setData({
                    ...pageData,
                    defaultRecordingAccountId: snapshot.exists() ? snapshot.val() : ''
                });
            });
            
            return () => unsub();
        };
        fetchData();
    }, []);

    if (!data) {
        return <div>Loading form...</div>;
    }

    return (
        <ModernTransactionForm 
            initialClients={data.clients} 
            allAccounts={data.allAccounts}
            serviceProviders={data.serviceProviders}
            defaultRecordingAccountId={data.defaultRecordingAccountId}
        />
    );
}

export default function ModernTransactionPage() {
    return (
        <>
            <PageHeader
                title="Create Transaction"
                description="Create a new transaction by linking multiple financial records for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <FormLoader />
            </Suspense>
        </>
    );
}
