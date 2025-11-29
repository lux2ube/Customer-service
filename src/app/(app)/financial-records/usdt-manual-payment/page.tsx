

import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { UsdtManualPaymentForm } from "@/components/usdt-manual-payment-form";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client } from '@/lib/types';

async function getFormData() {
    const clientsRef = ref(db, 'clients');
    const clientsSnapshot = await get(clientsRef);
    
    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        Object.keys(data).forEach(key => {
            clients.push({ id: key, ...data[key] });
        });
    }

    return { clients };
}


export default async function UsdtManualPaymentPage() {
    const { clients } = await getFormData();

    return (
        <>
            <PageHeader
                title="USDT – Manual Payment"
                description="Record sending USDT to a client manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <UsdtManualPaymentForm clients={clients} />
            </Suspense>
        </>
    );
}
