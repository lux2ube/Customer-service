
import { PageHeader } from "@/components/page-header";
import { CashReceiptsTable } from "@/components/cash-receipts-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

export default async function CashReceiptsPage() {
    return (
        <>
            <PageHeader
                title="Cash Receipts"
                description="View and manage all recorded cash receipts."
            >
                <Button asChild>
                    <Link href="/cash-receipts/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Record New Receipt
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading receipts...</div>}>
                <CashReceiptsTable />
            </Suspense>
        </>
    );
}
