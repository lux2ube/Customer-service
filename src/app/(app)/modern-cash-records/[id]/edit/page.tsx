

'use server';

import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, CashRecord, Account } from '@/lib/types';
import { notFound } from "next/navigation";
import { CashReceiptForm } from "@/components/cash-receipt-form";
import { CashPaymentForm } from "@/components/cash-payment-form";

async function getPageData(recordId: string) {
    const recordRef = ref(db, `cash_records/${recordId}`);
    const clientsRef = ref(db, 'clients');
    const accountsRef = ref(db, 'accounts');

    const [recordSnapshot, clientsSnapshot, accountsSnapshot] = await Promise.all([
        get(recordRef),
        get(clientsRef),
        get(accountsRef),
    ]);
    
    if (!recordSnapshot.exists()) {
        return { record: null, clients: [], bankAccounts: [] };
    }
    
    const record: CashRecord = { id: recordId, ...recordSnapshot.val() };
    
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

    return { record, clients, bankAccounts };
}

export default async function EditModernCashRecordPage({ params }: { params: { id: string } }) {
    const { record, clients, bankAccounts } = await getPageData(params.id);

    if (!record) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit Cash Record"
                description={`Editing record ID: ${record.id} (Source: ${record.source})`}
            />
            <Suspense fallback={<div>Loading form...</div>}>
                {record.type === 'inflow' ? (
                    <CashReceiptForm record={record} />
                ) : (
                    <CashPaymentForm record={record} clients={clients} bankAccounts={bankAccounts} />
                )}
            </Suspense>
        </>
    );
}
