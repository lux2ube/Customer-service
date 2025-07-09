
import { PageHeader } from "@/components/page-header";
import { MexcDepositsTable } from "@/components/mexc-deposits-table";
import { Suspense } from "react";

export default function MexcDepositsPage() {
    return (
        <>
            <PageHeader
                title="MEXC Automated Deposits"
                description="Review and confirm pending client deposits to be executed via the MEXC API."
            />
            <Suspense fallback={<div>Loading pending deposits...</div>}>
                <MexcDepositsTable />
            </Suspense>
        </>
    );
}
