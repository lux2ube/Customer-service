
import { PageHeader } from "@/components/page-header";
import { CashFlowReport } from "@/components/cash-flow-report";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, JournalEntry } from '@/lib/types';

async function getReportData() {
    const [accountsSnapshot, journalEntriesSnapshot] = await Promise.all([
        get(ref(db, 'accounts')),
        get(ref(db, 'journal_entries')),
    ]);

    const accountsData = accountsSnapshot.val() || {};
    const journalEntriesData = journalEntriesSnapshot.val() || {};

    const accounts: Account[] = Object.keys(accountsData).map(key => ({ id: key, ...accountsData[key] }));
    const journalEntries: JournalEntry[] = Object.keys(journalEntriesData).map(key => ({ id: key, ...journalEntriesData[key] }));

    return { accounts, journalEntries };
}

export default async function CashFlowPage() {
    const { accounts, journalEntries } = await getReportData();

    return (
        <>
            <PageHeader
                title="Cash Flow Statement"
                description="Track cash inflows and outflows over a period."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <CashFlowReport 
                    initialAccounts={accounts} 
                    initialJournalEntries={journalEntries} 
                />
            </Suspense>
        </>
    );
}
