
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernCashRecordsTable } from "@/components/modern-cash-records-table";

export default async function ModernCashRecordsPage() {
    return (
        <>
            <PageHeader
                title="Modern Cash Records"
                description="A unified ledger for all cash inflows and outflows from any source."
            >
                <div className="flex gap-2">
                    <Button asChild>
                        <Link href="/modern-cash-records/inflow">
                            <ArrowDownToLine className="mr-2 h-4 w-4" />
                            New Inflow
                        </Link>
                    </Button>
                     <Button asChild variant="outline">
                        <Link href="/modern-cash-records/outflow">
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            New Outflow
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading records...</div>}>
                 <ModernCashRecordsTable />
            </Suspense>
        </>
    );
}
