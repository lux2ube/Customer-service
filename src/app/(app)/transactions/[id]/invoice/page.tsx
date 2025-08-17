

import { InvoiceView } from '@/components/invoice-view';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Transaction, Client, CashRecord, UsdtRecord } from '@/lib/types';
import { notFound } from 'next/navigation';

async function getTransaction(id: string): Promise<Transaction | null> {
    const transactionRef = ref(db, `transactions/${id}`);
    const snapshot = await get(transactionRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getLinkedRecords(transaction: Transaction): Promise<(CashRecord | UsdtRecord)[]> {
    if (!transaction.inflows && !transaction.outflows) return [];

    const recordIds = [
        ...(transaction.inflows || []).map(leg => ({ id: leg.recordId, type: leg.type })),
        ...(transaction.outflows || []).map(leg => ({ id: leg.recordId, type: leg.type }))
    ];
    
    const uniqueRecordIds = Array.from(new Map(recordIds.map(item => [item.id, item])).values());

    const recordPromises = uniqueRecordIds.map(async ({ id, type }) => {
        const path = type === 'cash' ? `records/cash/${id}` : `records/usdt/${id}`;
        const snapshot = await get(ref(db, path));
        if (snapshot.exists()) {
            // Add a flag to distinguish record types easily
            const recordData = snapshot.val();
            return { id, ...recordData, recordType: type };
        }
        return null;
    });

    const records = await Promise.all(recordPromises);
    return records.filter(Boolean) as (CashRecord | UsdtRecord)[];
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
    const transaction = await getTransaction(params.id);

    if (!transaction) {
        notFound();
    }
    
    const client = transaction.clientId ? await getClient(transaction.clientId) : null;
    const linkedRecords = await getLinkedRecords(transaction);

    // The InvoiceView component will handle all the rendering logic.
    // We pass the fetched data as props.
    return (
        <InvoiceView transaction={transaction} client={client} linkedRecords={linkedRecords} />
    );
}
