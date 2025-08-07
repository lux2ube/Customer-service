
import { PageHeader } from "@/components/page-header";
import { CashPaymentForm } from "@/components/cash-payment-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account, CashPayment } from '@/lib/types';
import { notFound } from "next/navigation";

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
            if (!data[key].isGroup && data[key].currency && data[key].currency !== 'USDT') {
                 bankAccounts.push({ id: key, ...data[key] });
            }
        });
    }

    return { clients, bankAccounts };
}

async function getPayment(id: string): Promise<CashPayment | null> {
    const paymentRef = ref(db, `cash_payments/${id}`);
    const snapshot = await get(paymentRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

export default async function EditCashPaymentPage({ params }: { params: { id: string } }) {
    const { clients, bankAccounts } = await getFormData();
    const payment = await getPayment(params.id);

    if (!payment) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit Cash Payment"
                description="Update the details of a recorded cash payment."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <CashPaymentForm clients={clients} bankAccounts={bankAccounts} payment={payment} />
            </Suspense>
        </>
    );
}
