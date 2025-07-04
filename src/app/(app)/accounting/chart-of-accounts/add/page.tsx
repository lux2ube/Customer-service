
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getGroupAccounts(): Promise<Account[]> {
    const accountsRef = query(ref(db, 'accounts'), orderByChild('isGroup'), equalTo(true));
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
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
