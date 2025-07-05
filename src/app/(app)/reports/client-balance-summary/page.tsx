
import { PageHeader } from "@/components/page-header";
import { ClientBalanceSummaryReport } from "@/components/client-balance-summary-report";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Transaction } from '@/lib/types';

async function getReportData() {
    const transactionsRef = ref(db, 'transactions');
    const transactionsSnapshot = await get(transactionsRef);
    const transactionsData = transactionsSnapshot.val() || {};
    const transactions: Transaction[] = Object.keys(transactionsData).map(key => ({ id: key, ...transactionsData[key] }));
    return { transactions };
}

export default async function ClientBalanceSummaryPage() {
    const { transactions } = await getReportData();

    return (
        <>
            <PageHeader
                title="Client Balance Summary"
                description="Shows total invoiced amounts, payments received, and outstanding balances for each client."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <ClientBalanceSummaryReport initialTransactions={transactions} />
            </Suspense>
        </>
    );
}
