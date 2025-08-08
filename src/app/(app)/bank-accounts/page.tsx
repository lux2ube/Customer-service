
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { BankAccountsTable } from "@/components/bank-accounts-table";

export default function BankAccountsPage() {
    return (
        <>
            <PageHeader 
                title="Bank Accounts"
                description="Manage your bank and crypto wallet accounts."
            >
                <Button asChild>
                    <Link href="/bank-accounts/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Account
                    </Link>
                </Button>
            </PageHeader>
            <BankAccountsTable />
        </>
    );
}
