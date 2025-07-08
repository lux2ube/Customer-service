
import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client } from '@/lib/types';

export default async function AddTransactionPage() {
    return (
        <>
            <PageHeader
                title="Add Transaction"
                description="Record a new financial transaction manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm />
            </Suspense>
        </>
    );
}

    