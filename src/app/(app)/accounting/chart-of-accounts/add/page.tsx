
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getGroupAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        return allAccounts.filter(account => account.isGroup === true);
    }
    return [];
}

export default async function AddAccountPage() {
    const parentAccounts = await getGroupAccounts();

    return (
        <>
            <PageHeader
                title="Add New Account"
                description="Create a new account for your chart of accounts."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <AccountForm parentAccounts={parentAccounts} />
            </Suspense>
        </>
    );
}
