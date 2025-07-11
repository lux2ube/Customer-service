
import { PageHeader } from "@/components/page-header";
import { MexcTestDepositForm } from "@/components/mexc-test-deposit-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getFormData() {
    const accountsRef = ref(db, 'accounts');

    const accountsSnapshot = await get(accountsRef);
    
    const accounts: Account[] = accountsSnapshot.exists()
        ? Object.keys(accountsSnapshot.val()).map(key => ({ id: key, ...accountsSnapshot.val()[key] }))
        : [];
        
    const bankAccounts = accounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT');

    return { bankAccounts };
}

export default async function AddMexcTestDepositPage() {
    const { bankAccounts } = await getFormData();

    return (
        <>
            <PageHeader
                title="Add Test Deposit"
                description="Manually create a deposit to test the MEXC API workflow."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <MexcTestDepositForm bankAccounts={bankAccounts} />
            </Suspense>
        </>
    );
}
