import { PageHeader } from "@/components/page-header";
import { BankAccountForm } from "@/components/bank-account-form";
import { Suspense } from "react";

export default async function AddBankAccountPage() {
    return (
        <>
            <PageHeader
                title="Add Bank Account"
                description="Create a new bank account record."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <BankAccountForm />
            </Suspense>
        </>
    );
}
