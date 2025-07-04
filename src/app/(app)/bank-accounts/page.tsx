import { PageHeader } from "@/components/page-header";
import { BankAccountsTable } from "@/components/bank-accounts-table";
import { AddBankAccountDialog } from "@/components/add-bank-account-dialog";

export default function BankAccountsPage() {
    return (
        <>
            <PageHeader 
                title="Bank Accounts"
                description="Manage your company's bank accounts."
            >
                <AddBankAccountDialog />
            </PageHeader>
            <BankAccountsTable />
        </>
    );
}
