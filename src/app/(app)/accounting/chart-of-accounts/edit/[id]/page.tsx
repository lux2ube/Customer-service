
import { PageHeader } from "@/components/page-header";
import { AccountForm } from "@/components/account-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';
import { notFound } from "next/navigation";

async function getAccount(id: string): Promise<Account | null> {
    const accountRef = ref(db, `accounts/${id}`);
    const snapshot = await get(accountRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

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

export default async function EditAccountPage({ params }: { params: { id: string } }) {
    const account = await getAccount(params.id);

    if (!account) {
        notFound();
    }
    
    const parentAccounts = await getGroupAccounts();

    return (
        <>
            <PageHeader
                title="Edit Account"
                description="Update the details of an existing account."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <AccountForm account={account} parentAccounts={parentAccounts} />
            </Suspense>
        </>
    );
}
