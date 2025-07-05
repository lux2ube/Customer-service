
import { PageHeader } from "@/components/page-header";
import { TrialBalanceReport } from "@/components/trial-balance-report";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, JournalEntry, Transaction } from '@/lib/types';

async function getReportData() {
    const accountsRef = ref(db, 'accounts');
    const journalEntriesRef = ref(db, 'journal_entries');
    const transactionsRef = ref(db, 'transactions');

    const [accountsSnapshot, journalEntriesSnapshot, transactionsSnapshot] = await Promise.all([
        get(accountsRef),
        get(journalEntriesRef),
        get(transactionsRef),
    ]);

    const accountsData = accountsSnapshot.val() || {};
    const journalEntriesData = journalEntriesSnapshot.val() || {};
    const transactionsData = transactionsSnapshot.val() || {};

    const accounts: Account[] = Object.keys(accountsData).map(key => ({ id: key, ...accountsData[key] }));
    const journalEntries: JournalEntry[] = Object.keys(journalEntriesData).map(key => ({ id: key, ...journalEntriesData[key] }));
    const transactions: Transaction[] = Object.keys(transactionsData).map(key => ({ id: key, ...transactionsData[key] }));

    return { accounts, journalEntries, transactions };
}


export default async function TrialBalancePage() {
    const { accounts, journalEntries, transactions } = await getReportData();

    return (
        <>
            <PageHeader
                title="Trial Balance"
                description="Summarizes all account debits and credits to verify the ledger is balanced."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <TrialBalanceReport 
                    initialAccounts={accounts} 
                    initialJournalEntries={journalEntries} 
                    initialTransactions={transactions}
                />
            </Suspense>
        </>
    );
}
