
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, ModernUsdtRecord } from '@/lib/types';
import { notFound } from "next/navigation";
import { EditModernUsdtRecordForm } from "@/components/edit-modern-usdt-record-form";


async function getPageData(recordId: string) {
    const recordRef = ref(db, `modern_usdt_records/${recordId}`);
    const clientsRef = ref(db, 'clients');

    const [recordSnapshot, clientsSnapshot] = await Promise.all([
        get(recordRef),
        get(clientsRef),
    ]);
    
    if (!recordSnapshot.exists()) {
        return { record: null, clients: [] };
    }
    
    const record: ModernUsdtRecord = { id: recordId, ...recordSnapshot.val() };
    
    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }

    return { record, clients };
}

export default async function EditModernUsdtRecordPage({ params }: { params: { id: string } }) {
    const { record, clients } = await getPageData(params.id);

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
                <EditModernUsdtRecordForm record={record} clients={clients} />
            </Suspense>
        </>
    );
}
