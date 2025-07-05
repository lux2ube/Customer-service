
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { TransactionsTable } from "@/components/transactions-table";
import { SyncButton } from "@/components/sync-button";

export default function TransactionsPage() {
    return (
        <>
            <PageHeader 
                title="Transactions"
                description="Manage all financial transactions."
            >
                <div className="flex items-center gap-2">
                    <SyncButton />
                    <Button asChild>
                        <Link href="/transactions/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Transaction
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <TransactionsTable />
        </>
    );
}
