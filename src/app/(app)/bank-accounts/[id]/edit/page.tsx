
import { PageHeader } from "@/components/page-header";
import { BankAccountForm } from "@/components/bank-account-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { BankAccount } from '@/lib/types';
import { notFound } from "next/navigation";

async function getBankAccount(id: string): Promise<BankAccount | null> {
    const accountRef = ref(db, `bank_accounts/${id}`);
    const snapshot = await get(accountRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

export default async function EditBankAccountPage({ params }: { params: { id: string } }) {
    const account = await getBankAccount(params.id);

    if (!account) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit Bank Account"
                description="Update the bank account details."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <BankAccountForm account={account} />
            </Suspense>
        </>
    );
}
