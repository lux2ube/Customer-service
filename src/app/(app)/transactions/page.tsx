
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { ExportButton } from '@/components/export-button';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Transaction } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TransactionsPage() {
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [exportData, setExportData] = React.useState<Transaction[]>([]);
    const router = useRouter();

    React.useEffect(() => {
        const transactionsRef = ref(db, 'transactions/');
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
        
        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const handleRowClick = (txId: string) => {
        // Since we don't have a dedicated edit page anymore, this can be removed or repurposed.
        // For now, it does nothing.
    };

    const exportableData = exportData.map(tx => ({
        id: tx.id,
        date: tx.date,
        clientName: tx.clientName,
        type: tx.type,
        amount_usd: tx.amount_usd,
        amount_usdt: tx.amount_usdt,
        status: tx.status,
    }));

    return (
        <div className="space-y-6">
            <PageHeader 
                title="Transactions"
                description="View all consolidated financial transactions."
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
                            amount_usd: "Amount (USD)",
                            amount_usdt: "Amount (USDT)",
                            status: "Status",
                        }}
                    />
                    <Button asChild>
                        <Link href="/transactions/modern">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add New Transaction
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            
            {loading && <Skeleton className="h-[200px] w-full" />}
            
            <TransactionsTable 
                transactions={transactions} 
                loading={loading}
                onFilteredDataChange={setExportData}
                onRowClick={handleRowClick}
                selectedTxId={null} // No longer needed
            />
        </div>
    );
}
