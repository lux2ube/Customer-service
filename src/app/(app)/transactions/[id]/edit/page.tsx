
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Transaction } from '@/lib/types';
import { notFound } from "next/navigation";

async function getTransaction(id: string): Promise<Transaction | null> {
    const transactionRef = ref(db, `transactions/${id}`);
    const snapshot = await get(transactionRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

export default async function EditTransactionPage({ params }: { params: { id: string } }) {
    const transaction = await getTransaction(params.id);

    if (!transaction) {
        notFound();
    }

    return (
        <>
            <PageHeader
                title="Edit Transaction"
                description="Update the details of an existing transaction."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm transaction={transaction} />
            </Suspense>
        </>
    );
}
