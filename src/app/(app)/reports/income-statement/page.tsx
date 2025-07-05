
import { PageHeader } from "@/components/page-header";
import { IncomeStatementReport } from "@/components/income-statement-report";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, JournalEntry } from '@/lib/types';

async function getReportData() {
    const accountsRef = ref(db, 'accounts');
    const journalEntriesRef = ref(db, 'journal_entries');

    const [accountsSnapshot, journalEntriesSnapshot] = await Promise.all([
        get(accountsRef),
        get(journalEntriesRef),
    ]);

    const accountsData = accountsSnapshot.val() || {};
    const journalEntriesData = journalEntriesSnapshot.val() || {};

    const accounts: Account[] = Object.keys(accountsData).map(key => ({ id: key, ...accountsData[key] }));
    const journalEntries: JournalEntry[] = Object.keys(journalEntriesData).map(key => ({ id: key, ...journalEntriesData[key] }));

    return { accounts, journalEntries };
}


export default async function IncomeStatementPage() {
    const { accounts, journalEntries } = await getReportData();

    return (
        <>
            <PageHeader
                title="Income Statement"
                description="Shows revenue, expenses, and net earnings over a specified period."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <IncomeStatementReport initialAccounts={accounts} initialJournalEntries={journalEntries} />
            </Suspense>
        </>
    );
}
