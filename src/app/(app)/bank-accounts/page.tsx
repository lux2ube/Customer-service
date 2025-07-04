import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

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
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                        Bank Accounts module is under construction.
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Come back soon to manage bank accounts.
                    </p>
                </div>
            </div>
        </>
    );
}
