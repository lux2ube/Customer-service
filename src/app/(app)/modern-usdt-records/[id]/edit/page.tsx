
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { UsdtManualReceiptForm } from "@/components/usdt-manual-receipt-form";
import { UsdtManualPaymentForm } from "@/components/usdt-manual-payment-form";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account, ModernUsdtRecord } from '@/lib/types';
import { notFound } from "next/navigation";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

async function getPageData(recordId: string) {
    const recordRef = ref(db, `modern_usdt_records/${recordId}`);
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
    
    const record: ModernUsdtRecord = { id: recordId, ...recordSnapshot.val() };
    
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
            if (!data[key].isGroup && data[key].currency === 'USDT') {
                 cryptoWallets.push({ id: key, ...data[key] });
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
                ) : record.type === 'outflow' ? (
                    <UsdtManualPaymentForm record={record} clients={clients} />
                ) : (
                    <Alert variant="destructive">
                        <AlertTitle>Unknown Record Type</AlertTitle>
                        <AlertDescription>Cannot edit a record with an unknown type: "{record.type}"</AlertDescription>
                    </Alert>
                )}
            </Suspense>
        </>
    );
}
