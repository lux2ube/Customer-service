
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, ModernCashRecord } from '@/lib/types';
import { notFound } from "next/navigation";
import { EditModernCashRecordForm } from "@/components/edit-modern-cash-record-form";

async function getPageData(recordId: string) {
    const recordRef = ref(db, `modern_cash_records/${recordId}`);
    const clientsRef = ref(db, 'clients');

    const [recordSnapshot, clientsSnapshot] = await Promise.all([
        get(recordRef),
        get(clientsRef),
    ]);
    
    if (!recordSnapshot.exists()) {
        return { record: null, clients: [] };
    }
    
    const record: ModernCashRecord = { id: recordId, ...recordSnapshot.val() };
    
    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }

    return { record, clients };
}

export default async function EditModernCashRecordPage({ params }: { params: { id: string } }) {
    const { record, clients } = await getPageData(params.id);

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
                <EditModernCashRecordForm record={record} clients={clients} />
            </Suspense>
        </>
    );
}
