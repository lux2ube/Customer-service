
import { PageHeader } from "@/components/page-header";
import { AccountBalancesReport } from "@/components/account-balances-report";
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

export default async function AccountBalancesPage() {
    const { accounts, journalEntries } = await getReportData();

    return (
        <>
            <PageHeader
                title="Account Balances"
                description="View all accounts with their increases, decreases, and current balances."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <AccountBalancesReport 
                    initialAccounts={accounts} 
                    initialJournalEntries={journalEntries} 
                />
            </Suspense>
        </>
    );
}
