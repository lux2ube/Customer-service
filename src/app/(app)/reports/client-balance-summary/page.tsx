
export const dynamic = 'force-dynamic';

import { PageHeader } from "@/components/page-header";
import { ClientBalanceSummaryReport } from "@/components/client-balance-summary-report";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { JournalEntry, Client, Account } from '@/lib/types';

async function getReportData() {
    const [journalEntriesSnapshot, clientsSnapshot, accountsSnapshot] = await Promise.all([
        get(ref(db, 'journal_entries')),
        get(ref(db, 'clients')),
        get(ref(db, 'accounts'))
    ]);

    const journalEntries: JournalEntry[] = journalEntriesSnapshot.exists() 
        ? Object.values(journalEntriesSnapshot.val()) 
        : [];
        
    const clients: Client[] = clientsSnapshot.exists()
        ? Object.keys(clientsSnapshot.val()).map(key => ({ id: key, ...clientsSnapshot.val()[key] }))
        : [];
        
    const accounts: Account[] = accountsSnapshot.exists()
        ? Object.values(accountsSnapshot.val())
        : [];

    return { journalEntries, clients, accounts };
}

export default async function ClientBalanceSummaryPage() {
    const { journalEntries, clients, accounts } = await getReportData();

    return (
        <>
            <PageHeader
                title="Client Balance Summary"
                description="Shows total credits, debits, and outstanding balances for each client's sub-account."
            />
            <Suspense fallback={<div>Loading report...</div>}>
                <ClientBalanceSummaryReport 
                    initialJournalEntries={journalEntries}
                    initialClients={clients} 
                    initialAccounts={accounts}
                />
            </Suspense>
        </>
    );
}
