
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { CashReceiptForm } from "@/components/cash-receipt-form";
import { CashPaymentForm } from "@/components/cash-payment-form";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account, ModernCashRecord } from '@/lib/types';
import { notFound } from "next/navigation";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

async function getPageData(recordId: string) {
    const recordRef = ref(db, `modern_cash_records/${recordId}`);
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
    
    const record: ModernCashRecord = { id: recordId, ...recordSnapshot.val() };
    
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
                    <CashReceiptForm record={record} clients={clients} bankAccounts={bankAccounts} />
                ) : record.type === 'outflow' ? (
                    <CashPaymentForm record={record} clients={clients} bankAccounts={bankAccounts} />
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
