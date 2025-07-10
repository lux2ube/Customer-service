
import { PageHeader } from "@/components/page-header";
import { MexcTestDepositForm } from "@/components/mexc-test-deposit-form";
import { Suspense } from "react";
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

    const clients: Client[] = clientsSnapshot.exists() 
        ? Object.keys(clientsSnapshot.val()).map(key => ({ id: key, ...clientsSnapshot.val()[key] }))
        : [];
    
    const accounts: Account[] = accountsSnapshot.exists()
        ? Object.keys(accountsSnapshot.val()).map(key => ({ id: key, ...accountsSnapshot.val()[key] }))
        : [];
        
    const bankAccounts = accounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT');

    return { clients, bankAccounts };
}

export default async function AddMexcTestDepositPage() {
    const { clients, bankAccounts } = await getFormData();

    return (
        <>
            <PageHeader
                title="Add Test Deposit"
                description="Manually create a deposit to test the MEXC API workflow."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <MexcTestDepositForm clients={clients} bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
