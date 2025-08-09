
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { ExportButton } from '@/components/export-button';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Transaction, Client } from '@/lib/types';
import { TransactionForm } from '@/components/transaction-form';
import { Skeleton } from '@/components/ui/skeleton';

export default function TransactionsPage() {
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [exportData, setExportData] = React.useState<Transaction[]>([]);

    const [selectedTxId, setSelectedTxId] = React.useState<string | null>(null);
    const [isCreatingNew, setIsCreatingNew] = React.useState(false);

    const selectedTransaction = React.useMemo(() => {
        if (!selectedTxId) return null;
        return transactions.find(tx => tx.id === selectedTxId) || null;
    }, [selectedTxId, transactions]);

    const selectedClient = React.useMemo(() => {
        if (!selectedTransaction || !selectedTransaction.clientId) return null;
        return clients.find(c => c.id === selectedTransaction.clientId) || null;
    }, [selectedTransaction, clients]);

    React.useEffect(() => {
        const transactionsRef = ref(db, 'transactions/');
        const clientsRef = ref(db, 'clients/');
        
        const unsubs: (()=>void)[] = [];

        unsubs.push(onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
                }));
                setTransactions(list);
            } else {
                setTransactions([]);
            }
            setLoading(false);
        }));
        
        unsubs.push(onValue(clientsRef, (snapshot) => {
            const data = snapshot.val();
             if (data) {
                const list: Client[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
                }));
                setClients(list);
            } else {
                setClients([]);
            }
        }));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const handleSelectTransaction = (txId: string) => {
        setIsCreatingNew(false);
        setSelectedTxId(txId);
    };
    
    const handleCreateNew = () => {
        setSelectedTxId(null);
        setIsCreatingNew(true);
    }
    
    const handleFormSuccess = (txId: string) => {
        setIsCreatingNew(false);
        setSelectedTxId(txId);
    }

    const exportableData = exportData.map(tx => ({
        id: tx.id,
        date: tx.date,
        clientName: tx.clientName || tx.clientId,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        amount_usd: tx.amount_usd,
        status: tx.status,
        hash: tx.hash,
        remittance_number: tx.remittance_number,
        notes: tx.notes,
    }));

    return (
        <div className="space-y-6">
            <PageHeader 
                title="Transactions"
                description="Manage all financial transactions."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <ExportButton 
                        data={exportableData} 
                        filename="transactions"
                        headers={{
                            id: "ID",
                            date: "Date",
                            clientName: "Client",
                            type: "Type",
                            amount: "Amount",
                            currency: "Currency",
                            amount_usd: "Amount (USD)",
                            status: "Status",
                            hash: "Hash",
                            remittance_number: "Remittance #",
                            notes: "Notes",
                        }}
                    />
                    <Button onClick={handleCreateNew}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add New Transaction
                    </Button>
                </div>
            </PageHeader>
            
            {(selectedTransaction || isCreatingNew) && (
                <TransactionForm
                    key={selectedTxId || 'new'}
                    transaction={selectedTransaction}
                    client={selectedClient}
                    onSuccess={handleFormSuccess}
                />
            )}
            
            {loading && <Skeleton className="h-[200px] w-full" />}
            
            <TransactionsTable 
                transactions={transactions} 
                loading={loading}
                onFilteredDataChange={setExportData}
                onRowClick={handleSelectTransaction}
                selectedTxId={selectedTxId}
            />
        </div>
    );
}
