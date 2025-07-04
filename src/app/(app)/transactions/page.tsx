import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function TransactionsPage() {
    return (
        <>
            <PageHeader 
                title="Transactions"
                description="Manage all financial transactions."
            >
                <Button asChild>
                    <Link href="/transactions/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Transaction
                    </Link>
                </Button>
            </PageHeader>
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                        Transaction module is under construction.
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Come back soon to manage financial transactions.
                    </p>
                </div>
            </div>
        </>
    );
}
