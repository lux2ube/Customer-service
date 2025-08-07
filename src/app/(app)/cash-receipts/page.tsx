
import { PageHeader } from "@/components/page-header";
import { CashReceiptForm } from "@/components/cash-receipt-form";
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
            if (!data[key].isGroup && data[key].currency !== 'USDT') {
                 bankAccounts.push({ id: key, ...data[key] });
            }
        });
    }

    return { clients, bankAccounts };
}


export default async function CashReceiptsPage() {
    const { clients, bankAccounts } = await getFormData();

    return (
        <>
            <PageHeader
                title="Record Cash Receipt"
                description="Use this form to record cash received in your bank accounts."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <CashReceiptForm clients={clients} bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
