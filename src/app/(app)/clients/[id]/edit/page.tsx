

'use client';

import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get, query, orderByChild, equalTo, onValue } from 'firebase/database';
import type { Client, Account, Transaction, AuditLog, CashRecord, UsdtRecord, ClientActivity, ServiceProvider } from '@/lib/types';
import { notFound } from "next/navigation";
import React from "react";

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getClientActivityHistory(clientId: string): Promise<ClientActivity[]> {
    const [cashRecordsSnap, usdtRecordsSnap] = await Promise.all([
        get(query(ref(db, 'cash_records'), orderByChild('clientId'), equalTo(clientId))),
        get(query(ref(db, 'modern_usdt_records'), orderByChild('clientId'), equalTo(clientId)))
    ]);

    const history: ClientActivity[] = [];

    if (cashRecordsSnap.exists()) {
        const records: Record<string, CashRecord> = cashRecordsSnap.val();
        Object.entries(records).forEach(([key, record]) => {
            history.push({
                id: `cash-${key}`,
                date: record.date,
                type: record.type === 'inflow' ? 'Cash Inflow' : 'Cash Outflow',
                description: `${record.type === 'inflow' ? 'From' : 'To'} ${record.senderName || record.recipientName || 'N/A'} via ${record.accountName}`,
                amount: record.type === 'inflow' ? record.amount : -record.amount,
                currency: record.currency,
                status: record.status,
                source: 'Cash Record',
                link: `/records/cash/${key}/edit`
            });
        });
    }
    
    if (usdtRecordsSnap.exists()) {
        const records: Record<string, UsdtRecord> = usdtRecordsSnap.val();
        Object.entries(records).forEach(([key, record]) => {
            history.push({
                id: `usdt-${key}`,
                date: record.date,
                type: record.type === 'inflow' ? 'USDT Inflow' : 'USDT Outflow',
                description: `${record.type === 'inflow' ? 'From' : 'To'} ${record.clientWalletAddress || 'N/A'}`,
                amount: record.type === 'inflow' ? record.amount : -record.amount,
                currency: 'USDT',
                status: record.status,
                source: 'USDT Record',
                link: `/records/usdt/${key}/edit`
            });
        });
    }

    // Sort by date descending
    history.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
    });
    
    return history;
}

async function getClientAuditLogs(clientId: string): Promise<AuditLog[]> {
    const logsRef = ref(db, 'logs');
    const snapshot = await get(query(logsRef, orderByChild('entityId'), equalTo(clientId)));
    if (!snapshot.exists()) {
        return [];
    }
    return Object.keys(snapshot.val())
        .map(key => ({ id: key, ...snapshot.val()[key] }))
        .filter(log => log.entityType === 'client')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

async function getOtherClientsWithSameName(client: Client): Promise<Client[]> {
    if (!client.name) return [];
    
    const nameParts = client.name.trim().split(/\s+/);
    if (nameParts.length < 2) return [];

    const firstTwoNames = `${nameParts[0]} ${nameParts[1]}`.toLowerCase();

    const clientsRef = ref(db, 'clients');
    const snapshot = await get(clientsRef);
    if (!snapshot.exists()) {
        return [];
    }
    
    const allClients: Client[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
    
    return allClients.filter(c => {
        if (c.id === client.id || !c.name) return false;
        const otherNameParts = c.name.trim().split(/\s+/);
        if (otherNameParts.length < 2) return false;
        const otherFirstTwo = `${otherNameParts[0]} ${otherNameParts[1]}`.toLowerCase();
        return otherFirstTwo === firstTwoNames;
    });
}

async function getServiceProviders(): Promise<ServiceProvider[]> {
    const providersRef = ref(db, 'serviceProviders');
    const snapshot = await get(providersRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}


export default function EditClientPage({ params }: { params: { id: string } }) {
    const [client, setClient] = React.useState<Client | null>(null);
    const [activityHistory, setActivityHistory] = React.useState<ClientActivity[]>([]);
    const [otherClients, setOtherClients] = React.useState<Client[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([]);
    const [serviceProviders, setServiceProviders] = React.useState<ServiceProvider[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const clientData = await getClient(params.id);
            if (clientData) {
                setClient(clientData);
                const [history, others, logs, providers] = await Promise.all([
                    getClientActivityHistory(params.id),
                    getOtherClientsWithSameName(clientData),
                    getClientAuditLogs(params.id),
                    getServiceProviders()
                ]);
                setActivityHistory(history);
                setOtherClients(others);
                setAuditLogs(logs);
                setServiceProviders(providers);
            }
            setLoading(false);
        };
        fetchData();
    }, [params.id]);

    if (loading) {
        return (
            <>
                <PageHeader title="Edit Client" description="Loading client details..." />
                <div>Loading form...</div>
            </>
        )
    }

    if (!client) {
        notFound();
    }
    
    const usedProviderIds = new Set(client?.serviceProviders?.map(sp => sp.providerId) || []);
    const usedServiceProviders = serviceProviders.filter(p => usedProviderIds.has(p.id));

    return (
        <>
            <PageHeader
                title="Edit Client"
                description="Update the client's profile details."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ClientForm 
                    client={client} 
                    activityHistory={activityHistory}
                    otherClientsWithSameName={otherClients} 
                    auditLogs={auditLogs} 
                    usedServiceProviders={usedServiceProviders}
                />
            </Suspense>
        </>
    );
}
