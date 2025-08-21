

import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, UsdtRecord, Account } from '@/lib/types';
import { notFound } from "next/navigation";
import { UsdtManualReceiptForm } from "@/components/usdt-manual-receipt-form";
import { UsdtManualPaymentForm } from "@/components/usdt-manual-payment-form";

async function getPageData(recordId: string) {
    const recordRef = ref(db, `records/usdt/${recordId}`);
    const clientsRef = ref(db, 'clients');
    const accountsRef = ref(db, 'accounts');

    const [recordSnapshot, clientsSnapshot, accountsSnapshot] = await Promise.all([
        get(recordRef),
        get(clientsRef),
        get(accountsRef),
    ]);
    
    if (!recordSnapshot.exists()) {
        return { record: null, clients: [], cryptoWallets: [] };
    }
    
    const record: UsdtRecord = { id: recordId, ...recordSnapshot.val() };
    
    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }

    const cryptoWallets: Account[] = [];
    if (accountsSnapshot.exists()) {
        const data = accountsSnapshot.val();
        Object.keys(data).forEach(key => {
            const accountData = data[key];
            if (accountData && !accountData.isGroup && accountData.currency === 'USDT') {
                 cryptoWallets.push({ id: key, ...accountData });
            }
        });
    }

    return { record, clients, cryptoWallets };
}

export default async function EditModernUsdtRecordPage({ params }: { params: { id: string } }) {
    const { record, clients, cryptoWallets } = await getPageData(params.id);

    if (!record) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit USDT Record"
                description={`Editing record ID: ${record.id}`}
            />
            <Suspense fallback={<div>Loading form...</div>}>
                {record.type === 'inflow' ? (
                    <UsdtManualReceiptForm record={record} clients={clients} cryptoWallets={cryptoWallets} />
                ) : (
                     <UsdtManualPaymentForm record={record} clients={clients} cryptoWallets={cryptoWallets} />
                )}
            </Suspense>
        </>
    );
}
