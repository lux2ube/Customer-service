
import { PageHeader } from "@/components/page-header";
import { MexcTestDepositForm } from "@/components/mexc-test-deposit-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { BankAccount } from '@/lib/types';

async function getFormData() {
    const bankAccountsRef = ref(db, 'bank_accounts');
    const bankAccountsSnapshot = await get(bankAccountsRef);
    
    const bankAccounts: BankAccount[] = bankAccountsSnapshot.exists()
        ? Object.keys(bankAccountsSnapshot.val()).map(key => ({ id: key, ...bankAccountsSnapshot.val()[key] }))
        : [];
        
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
