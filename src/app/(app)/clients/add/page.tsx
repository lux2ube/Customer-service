import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getBankAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
        return allAccounts.filter(acc => 
            !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'
        );
    }
    return [];
}

export default async function AddClientPage() {
    const bankAccounts = await getBankAccounts();

    return (
        <>
            <PageHeader
                title="Add Client"
                description="Create a new client profile."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ClientForm bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
