
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CashPaymentsTable } from "@/components/cash-payments-table";

export default async function CashPaymentsPage() {
    return (
        <>
            <PageHeader
                title="Cash Payments"
                description="View and manage all recorded cash payments and outgoing SMS transactions."
            >
                <Button asChild>
                    <Link href="/cash-payments/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Record New Payment
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading payments...</div>}>
                 <CashPaymentsTable />
            </Suspense>
        </>
    );
}
