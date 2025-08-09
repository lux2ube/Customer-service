
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "@/components/clients-table";
import { ImportClientsButton } from "@/components/import-clients-button";
import { ExportButton } from '@/components/export-button';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, Account, Transaction } from '@/lib/types';
import { MergeClientsButton } from '@/components/merge-clients-button';
import { Suspense } from "react";

async function getInitialData(): Promise<{
    clients: Client[];
    transactions: Transaction[];
    bankAccounts: Account[];
    cryptoWallets: Account[];
}> {
    const [clientsSnap, transactionsSnap, accountsSnap] = await Promise.all([
        get(ref(db, 'clients/')),
        get(ref(db, 'transactions/')),
        get(ref(db, 'accounts/')),
    ]);

    const clients: Client[] = [];
    if (clientsSnap.exists()) {
        const data = clientsSnap.val();
        Object.keys(data).forEach(key => clients.push({ id: key, ...data[key] }));
    }

    const transactions: Transaction[] = transactionsSnap.exists() ? Object.values(transactionsSnap.val()) : [];
    
    const bankAccounts: Account[] = [];
    const cryptoWallets: Account[] = [];
    if (accountsSnap.exists()) {
        const allAccounts: Account[] = Object.values(accountsSnap.val());
        bankAccounts.push(...allAccounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
        cryptoWallets.push(...allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
    }

    return { clients, transactions, bankAccounts, cryptoWallets };
}

export default async function ClientsPage() {
    const { clients, transactions, bankAccounts, cryptoWallets } = await getInitialData();
    const [exportData, setExportData] = React.useState<Client[]>([]);

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
                    {/* The ExportButton is a client component and will be managed inside ClientsTableWrapper if needed */}
                    <Button asChild>
                        <Link href="/clients/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Client
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading clients...</div>}>
                <ClientsTable
                    initialClients={clients}
                    initialTransactions={transactions}
                    initialBankAccounts={bankAccounts}
                    initialCryptoWallets={cryptoWallets}
                />
            </Suspense>
        </div>
    );
}
