

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
import { ref, get, onValue } from 'firebase/database';
import type { Client, Transaction, Account } from '@/lib/types';
import { MergeClientsButton } from '@/components/merge-clients-button';
import { Suspense } from "react";
import { Skeleton } from '@/components/ui/skeleton';

export default function ClientsPage() {
    const [clients, setClients] = React.useState<Client[]>([]);
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [exportData, setExportData] = React.useState<Client[]>([]);

    React.useEffect(() => {
        const clientsRef = ref(db, 'clients/');
        const transactionsRef = ref(db, 'modern_transactions/');
        const accountsRef = ref(db, 'accounts/');

        const unsubs: (() => void)[] = [];

        setLoading(true);
        Promise.all([
            get(clientsRef),
            get(transactionsRef),
            get(accountsRef)
        ]).then(([clientsSnap, transactionsSnap, accountsSnap]) => {
            const clientList: Client[] = [];
            if (clientsSnap.exists()) {
                const data = clientsSnap.val();
                Object.keys(data).forEach(key => clientList.push({ id: key, ...data[key] }));
            }
            setClients(clientList);

            const transactionList: Transaction[] = transactionsSnap.exists() ? Object.values(transactionsSnap.val()) : [];
            setTransactions(transactionList);
            
            const bankAccountList: Account[] = [];
            const cryptoWalletList: Account[] = [];
            if (accountsSnap.exists()) {
                const allAccountsData = accountsSnap.val();
                const allAccounts: Account[] = Object.keys(allAccountsData).map(key => ({ id: key, ...allAccountsData[key] }));
                bankAccountList.push(...allAccounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
                cryptoWalletList.push(...allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
            }
            setBankAccounts(bankAccountList);
            setCryptoWallets(cryptoWalletList);
            
            setLoading(false);
        });

        unsubs.push(onValue(clientsRef, (snapshot) => {
            const data = snapshot.val();
            const clientList: Client[] = [];
            if (data) {
                Object.keys(data).forEach(key => clientList.push({ id: key, ...data[key] }));
            }
            setClients(clientList);
        }));

        return () => unsubs.forEach(unsub => unsub());

    }, []);


    const exportableData = exportData.map(client => ({
        id: client.id,
        name: client.name,
        phone: (Array.isArray(client.phone) ? client.phone.join(', ') : client.phone) || '',
        verification_status: client.verification_status,
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
                    <ExportButton data={exportableData} filename="clients" />
                    <Button asChild>
                        <Link href="/clients/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Client
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <ClientsTable
                    initialClients={clients}
                    initialTransactions={transactions}
                    initialBankAccounts={bankAccounts}
                    initialCryptoWallets={cryptoWallets}
                    onFilteredDataChange={setExportData}
                />
            </Suspense>
        </div>
    );
}
