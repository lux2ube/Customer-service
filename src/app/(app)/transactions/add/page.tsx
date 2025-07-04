import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";

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
