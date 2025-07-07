
import { PageHeader } from "@/components/page-header";
import { SmsTransactionsTable } from "@/components/sms-transactions-table";
import { Suspense } from "react";

export default function SmsTransactionsPage() {
    return (
        <>
            <PageHeader
                title="SMS Transactions"
                description="View and manage transactions parsed from incoming SMS messages."
            />
            <Suspense fallback={<div>Loading transactions...</div>}>
                <SmsTransactionsTable />
            </Suspense>
        </>
    );
}
