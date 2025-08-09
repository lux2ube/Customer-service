
import { PageHeader } from "@/components/page-header";
import { ExchangeForm } from "@/components/exchange-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account } from '@/lib/types';

async function getFormData() {
    const clientsRef = ref(db, 'clients');
    const accountsRef = ref(db, 'accounts');

    const [clientsSnapshot, accountsSnapshot] = await Promise.all([
        get(clientsRef),
        get(accountsRef),
    ]);

    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }

    const accounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const data = accountsSnapshot.val();
        Object.keys(data).forEach(key => {
            if (!data[key].isGroup) {
                 accounts.push({ id: key, ...data[key] });
            }
        });
    }

    return { clients, accounts };
}

export default async function ExchangePage() {
    const { clients, accounts } = await getFormData();

    return (
        <>
            <PageHeader
                title="Currency Exchange"
                description="Record a currency purchase or sale transaction."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ExchangeForm clients={clients} accounts={accounts} />
            </Suspense>
        </>
    );
}
