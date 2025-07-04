import { PageHeader } from "@/components/page-header";
import { TransactionsTable } from "@/components/transactions-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function TransactionsPage() {
    return (
        <>
            <PageHeader 
                title="Transactions"
                description="Manage all client deposits and withdrawals."
            >
                <Button asChild>
                    <Link href="/transactions/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Transaction
                    </Link>
                </Button>
            </PageHeader>
            <TransactionsTable />
        </>
    );
}
