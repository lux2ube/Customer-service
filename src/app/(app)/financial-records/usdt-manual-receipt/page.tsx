export const revalidate = 0;

import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
import { UsdtManualReceiptForm } from "@/components/usdt-manual-receipt-form";
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

    const cryptoWallets: Account[] = [];
    if (accountsSnapshot.exists()) {
        const data = accountsSnapshot.val();
        Object.keys(data).forEach(key => {
            if (!data[key].isGroup && data[key].currency === 'USDT') {
                 cryptoWallets.push({ id: key, ...data[key] });
            }
        });
    }

    return { clients, cryptoWallets };
}

export default async function UsdtManualReceiptPage() {
    const { clients, cryptoWallets } = await getFormData();

    return (
        <>
            <PageHeader
                title="USDT – Manual Receipt"
                description="Record receiving USDT from a client manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
               <UsdtManualReceiptForm clients={clients} cryptoWallets={cryptoWallets} />
            </Suspense>
        </>
    );
}
