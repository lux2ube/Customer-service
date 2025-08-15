
import { PageHeader } from "@/components/page-header";
import { ModernTransactionForm } from "@/components/modern-transaction-form";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref } from "firebase/database";
import type { Client, Account } from "@/lib/types";

async function getPageData(): Promise<{ clients: Client[], usdtAccounts: Account[] }> {
    const clientsRef = ref(db, 'clients');
    const accountsRef = ref(db, 'accounts');
    
    const [clientsSnapshot, accountsSnapshot] = await Promise.all([
        get(clientsRef),
        get(accountsRef)
    ]);

    const clients: Client[] = [];
    if (clientsSnapshot.exists()) {
        const data = clientsSnapshot.val();
        clients.push(...Object.keys(data).map(key => ({ id: key, ...data[key] })));
    }

    const usdtAccounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const allAccounts: Record<string, Account> = accountsSnapshot.val();
        for (const id in allAccounts) {
            if (!allAccounts[id].isGroup && allAccounts[id].currency === 'USDT') {
                usdtAccounts.push({ id, ...allAccounts[id] });
            }
        }
    }
    
    return { clients, usdtAccounts };
}


export default async function ModernTransactionPage() {
    const { clients, usdtAccounts } = await getPageData();

    return (
        <>
            <PageHeader
                title="Modern Transaction"
                description="Create a new transaction by linking multiple financial records for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ModernTransactionForm initialClients={clients} usdtAccounts={usdtAccounts} />
            </Suspense>
        </>
    );
}
