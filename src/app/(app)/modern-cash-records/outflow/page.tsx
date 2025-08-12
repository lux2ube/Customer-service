
import { PageHeader } from "@/components/page-header";
import { CashPaymentForm } from "@/components/cash-payment-form";
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

    const bankAccounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const data = accountsSnapshot.val();
        Object.keys(data).forEach(key => {
            const account = data[key];
            if (!account.isGroup && account.type === 'Assets' && account.currency && account.currency !== 'USDT') {
                 bankAccounts.push({ id: key, ...account });
            }
        });
    }

    return { clients, bankAccounts };
}


export default async function AddCashOutflowPage() {
    const { clients, bankAccounts } = await getFormData();

    return (
        <>
            <PageHeader
                title="New Cash Outflow (Payment)"
                description="Record a cash payment. This will create a new record in the Modern Cash Records ledger."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <CashPaymentForm clients={clients} bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
