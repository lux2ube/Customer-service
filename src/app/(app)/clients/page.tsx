

'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "@/components/clients-table";
import { ImportClientsButton } from "@/components/import-clients-button";
import { ExportButton } from '@/components/export-button';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Client, Account, Transaction, TransactionFlag } from '@/lib/types';
import { MergeClientsButton } from '@/components/merge-clients-button';

export default function ClientsPage() {
    const [clients, setClients] = React.useState<Client[]>([]);
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [labels, setLabels] = React.useState<TransactionFlag[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [exportData, setExportData] = React.useState<Client[]>([]);

    React.useEffect(() => {
        const clientsRef = ref(db, 'clients/');
        const transactionsRef = ref(db, 'transactions/');
        const accountsRef = ref(db, 'accounts/');
        const labelsRef = ref(db, 'labels');
        
        const unsubs: (()=>void)[] = [];

        unsubs.push(onValue(clientsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Client[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
                })).sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    if (isNaN(dateA)) return 1;
                    if (isNaN(dateB)) return -1;
                    return dateB - dateA;
                });
                setClients(list);
            } else {
                setClients([]);
            }
            setLoading(false);
        }));
        
        unsubs.push(onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            setTransactions(data ? Object.values(data) : []);
        }));
        
        unsubs.push(onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                
                const uniqueBankAccounts = allAccounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT');
                const uniqueCryptoWallets = allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT');

                setBankAccounts(uniqueBankAccounts);
                setCryptoWallets(uniqueCryptoWallets);
            } else {
                 setBankAccounts([]);
                 setCryptoWallets([]);
            }
        }));

        unsubs.push(onValue(labelsRef, (snapshot) => {
            const data = snapshot.val();
            setLabels(data ? Object.values(data) : []);
        }));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const exportableData = exportData.map(client => ({
        id: client.id,
        name: client.name,
        phone: (Array.isArray(client.phone) ? client.phone.join(', ') : client.phone) || '',
        verification_status: client.verification_status,
        review_flags: client.review_flags?.join(', ') || 'None',
        createdAt: client.createdAt,
    }));

    return (
        <div className="space-y-6">
            <PageHeader 
                title="Clients"
                description="Manage customer profiles and history."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <MergeClientsButton />
                    <ImportClientsButton />
                    <ExportButton 
                        data={exportableData} 
                        filename="clients" 
                        headers={{
                            id: "Client ID",
                            name: "Name",
                            phone: "Phone",
                            verification_status: "Status",
                            review_flags: "Flags",
                            createdAt: "Created At",
                        }}
                    />
                    <Button asChild>
                        <Link href="/clients/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Client
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <ClientsTable 
                clients={clients} 
                transactions={transactions}
                bankAccounts={bankAccounts}
                cryptoWallets={cryptoWallets}
                labels={labels}
                loading={loading}
                onFilteredDataChange={setExportData}
            />
        </div>
    );
}
