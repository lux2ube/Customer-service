
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, Currency } from '@/lib/types';
import { notFound } from "next/navigation";

async function getAccount(id: string): Promise<Account | null> {
    const accountRef = ref(db, `accounts/${id}`);
    const snapshot = await get(accountRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getFormData(): Promise<{ parentAccounts: Account[], currencies: Currency[] }> {
    const accountsRef = ref(db, 'accounts');
    const currenciesRef = ref(db, 'settings/currencies');

    const [accountsSnapshot, currenciesSnapshot] = await Promise.all([
        get(accountsRef),
        get(currenciesRef),
    ]);
    
    let parentAccounts: Account[] = [];
    if (accountsSnapshot.exists()) {
        const data = accountsSnapshot.val();
        const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        parentAccounts = allAccounts.filter(account => account.isGroup === true);
    }
    
    const currencies: Currency[] = currenciesSnapshot.exists() ? Object.values(currenciesSnapshot.val()) : [];
    
    return { parentAccounts, currencies };
}

export default async function EditAccountPage({ params }: { params: { id: string } }) {
    const account = await getAccount(params.id);

    if (!account) {
        notFound();
    }
    
    const { parentAccounts, currencies } = await getFormData();

    return (
        <>
            <PageHeader
                title="Edit Account"
                description="Update the details of an existing account."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <AccountForm account={account} parentAccounts={parentAccounts} currencies={currencies} />
            </Suspense>
        </>
    );
}
