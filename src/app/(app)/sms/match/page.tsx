
import { PageHeader } from "@/components/page-header";
import { SmsMatchingView } from "@/components/sms-matching-view";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import type { CashRecord, Client } from '@/lib/types';

async function getPageData() {
    const recordsQuery = query(ref(db, 'cash_records'), orderByChild('status'), equalTo('Pending'));
    const clientsRef = ref(db, 'clients');
    
    const [recordsSnapshot, clientsSnapshot] = await Promise.all([
        get(recordsQuery),
        get(clientsRef)
    ]);
    
    const pendingSmsRecords: CashRecord[] = [];
    if (recordsSnapshot.exists()) {
        const allRecords: Record<string, CashRecord> = recordsSnapshot.val();
        for (const id in allRecords) {
            if (allRecords[id].source === 'SMS' && !allRecords[id].clientId) {
                pendingSmsRecords.push({ id, ...allRecords[id] });
            }
        }
    }
    
    const clients: Client[] = clientsSnapshot.exists() ? Object.values(clientsSnapshot.val()) : [];

    return { pendingSmsRecords, clients };
}

export default async function MatchSmsPage() {
    const { pendingSmsRecords, clients } = await getPageData();
    
    return (
        <>
            <PageHeader
                title="Match SMS to Clients"
                description="Review pending SMS records and link them to the correct client."
            />
            <Suspense fallback={<div>Loading unmatched records...</div>}>
                <SmsMatchingView initialRecords={pendingSmsRecords} allClients={clients} />
            </Suspense>
        </>
    )
}
