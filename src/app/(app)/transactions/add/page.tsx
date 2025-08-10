import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { Suspense } from "react";

export default function AddTransactionPage() {
    return (
        <>
            <PageHeader
                title="New Transaction"
                description="Create a new financial transaction for a client."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <TransactionForm />
            </Suspense>
        </>
    );
}
