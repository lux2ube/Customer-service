
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { ModernTransactionForm } from "@/components/modern-transaction-form";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref, onValue } from "firebase/database";
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


export default function ModernTransactionPage() {
    const [clients, setClients] = React.useState<Client[]>([]);
    const [usdtAccounts, setUsdtAccounts] = React.useState<Account[]>([]);
    const [serviceProviders, setServiceProviders] = React.useState<ServiceProvider[]>([]);
    const [defaultRecordingAccountId, setDefaultRecordingAccountId] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const fetchData = async () => {
            const data = await getPageData();
            setClients(data.clients);
            setUsdtAccounts(data.usdtAccounts);
            setServiceProviders(data.serviceProviders);
            
            const settingRef = ref(db, 'settings/wallet/defaultRecordingAccountId');
            const unsub = onValue(settingRef, (snapshot) => {
                 if (snapshot.exists()) {
                    setDefaultRecordingAccountId(snapshot.val());
                }
                setLoading(false);
            });
            
            return () => unsub();
        };
        fetchData();
    }, []);


    return (
        <>
            <PageHeader
                title="Modern Transaction"
                description="Create a new transaction by linking multiple financial records for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                {!loading && (
                    <ModernTransactionForm 
                        initialClients={clients} 
                        usdtAccounts={usdtAccounts}
                        serviceProviders={serviceProviders}
                        defaultRecordingAccountId={defaultRecordingAccountId}
                    />
                )}
            </Suspense>
        </>
    );
}

