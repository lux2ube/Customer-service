
import { PageHeader } from "@/components/page-header";
import { ChartOfAccountsTable } from "@/components/chart-of-accounts-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function ChartOfAccountsPage() {
    return (
        <>
            <PageHeader 
                title="Chart of Accounts"
                description="Manage the foundational accounts for your bookkeeping."
            >
                <Button asChild>
                    <Link href="/accounting/chart-of-accounts/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Account
                    </Link>
                </Button>
            </PageHeader>
            <ChartOfAccountsTable />
        </>
    );
}
