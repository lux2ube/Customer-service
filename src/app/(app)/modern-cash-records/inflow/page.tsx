
import { PageHeader } from "@/components/page-header";
import { CashReceiptForm } from "@/components/cash-receipt-form";
import { Suspense } from "react";

export default async function AddCashInflowPage() {
    return (
        <>
            <PageHeader
                title="New Cash Inflow (Receipt)"
                description="Record a cash receipt. This will create a new record in the Modern Cash Records ledger."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <CashReceiptForm />
            </Suspense>
        </>
    );
}
