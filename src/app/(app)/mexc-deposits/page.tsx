
import { PageHeader } from "@/components/page-header";
import { MexcDepositsTable } from "@/components/mexc-deposits-table";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function MexcDepositsPage() {
    return (
        <>
            <PageHeader
                title="MEXC Automated Deposits"
                description="Review and confirm pending client deposits to be executed via the MEXC API."
            >
                <Button asChild>
                    <Link href="/mexc-deposits/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Test Deposit
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading pending deposits...</div>}>
                <MexcDepositsTable />
            </Suspense>
        </>
    );
}
