

import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import type { Client, Account, Transaction, AuditLog, CashReceipt, CashPayment, SmsTransaction, ClientActivity, ServiceProvider } from '@/lib/types';
import { notFound } from "next/navigation";

async function getClient(id: string): Promise<Client | null> {
    const clientRef = ref(db, `clients/${id}`);
    const snapshot = await get(clientRef);
    if (snapshot.exists()) {
        return { id, ...snapshot.val() };
    }
    return null;
}

async function getClientActivityHistory(clientId: string): Promise<ClientActivity[]> {
    const [transactionsSnap, cashReceiptsSnap, cashPaymentsSnap, smsSnap] = await Promise.all([
        get(ref(db, 'transactions')),
        get(ref(db, 'cash_receipts')),
        get(ref(db, 'cash_payments')),
        get(ref(db, 'sms_transactions'))
    ]);

    const history: ClientActivity[] = [];

    if (transactionsSnap.exists()) {
        const transactions: Record<string, Transaction> = transactionsSnap.val();
        Object.keys(transactions).forEach(key => {
            const tx = transactions[key];
            if (tx.clientId === clientId) {
                history.push({
                    id: `tx-${key}`,
                    date: tx.date,
                    type: tx.type,
                    description: tx.type === 'Deposit' ? `vs ${tx.amount} ${tx.currency}` : `vs ${tx.amount_usdt} USDT`,
                    amount: tx.amount_usd,
                    currency: 'USD',
                    status: tx.status,
                    source: 'Transaction',
                    link: `/transactions/${key}/edit`,
                    bankAccountId: tx.bankAccountId
                });
            }
        });
    }
    
    if (cashReceiptsSnap.exists()) {
        const receipts: Record<string, CashReceipt> = cashReceiptsSnap.val();
        Object.keys(receipts).forEach(key => {
            const receipt = receipts[key];
            if (receipt.clientId === clientId) {
                 history.push({
                    id: `cr-${key}`,
                    date: receipt.date,
                    type: 'Cash Receipt',
                    description: `From ${receipt.senderName} via ${receipt.bankAccountName}`,
                    amount: receipt.amount,
                    currency: receipt.currency,
                    status: receipt.status,
                    source: 'Cash Receipt'
                });
            }
        });
    }
    
    if (cashPaymentsSnap.exists()) {
        const payments: Record<string, CashPayment> = cashPaymentsSnap.val();
        Object.keys(payments).forEach(key => {
            const payment = payments[key];
            if (payment.clientId === clientId) {
                history.push({
                    id: `cp-${key}`,
                    date: payment.date,
                    type: 'Cash Payment',
                    description: `To ${payment.recipientName} via ${payment.bankAccountName}`,
                    amount: -payment.amount, // Negative for payment
                    currency: payment.currency,
                    status: payment.status,
                    source: 'Cash Payment'
                });
            }
        });
    }

    if (smsSnap.exists()) {
        const smsTxs: Record<string, SmsTransaction> = smsSnap.val();
        Object.keys(smsTxs).forEach(key => {
            const sms = smsTxs[key];
             if (sms.matched_client_id === clientId) {
                history.push({
                    id: `sms-${key}`,
                    date: sms.parsed_at,
                    type: sms.type === 'credit' ? 'SMS Credit' : 'SMS Debit',
                    description: `From ${sms.client_name} via ${sms.account_name}`,
                    amount: sms.type === 'credit' ? sms.amount || 0 : -(sms.amount || 0),
                    currency: sms.currency || '',
                    status: sms.status,
                    source: 'SMS'
                });
            }
        });
    }

    // Sort by date descending
    history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    return history;
}


async function getClientAuditLogs(clientId: string): Promise<AuditLog[]> {
    const logsRef = ref(db, 'logs');
    // Fetch all logs and filter in code to avoid indexing issues.
    const snapshot = await get(logsRef);
    if (!snapshot.exists()) {
        return [];
    }
    const allLogs: Record<string, AuditLog> = snapshot.val();
    return Object.keys(allLogs)
        .map(key => ({ id: key, ...allLogs[key] }))
        .filter(log => log.entityId === clientId && log.entityType === 'client')
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
    const providersRef = ref(db, 'service_providers');
    const snapshot = await get(providersRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}


export default async function EditClientPage({ params }: { params: { id: string } }) {
    const { id } = params;
    const client = await getClient(id);

    if (!client) {
        notFound();
    }

    const activityHistory = await getClientActivityHistory(id);
    const otherClientsWithSameName = await getOtherClientsWithSameName(client);
    const auditLogs = await getClientAuditLogs(id);
    const serviceProviders = await getServiceProviders();
    
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
                    otherClientsWithSameName={otherClientsWithSameName} 
                    auditLogs={auditLogs} 
                    usedServiceProviders={usedServiceProviders}
                />
            </Suspense>
        </>
    );
}
