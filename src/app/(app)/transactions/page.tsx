'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle, Bot } from "lucide-react";
import Link from "next/link";
import { TransactionsTable } from "@/components/transactions-table";
import { SyncButton } from "@/components/sync-button";
import { ExportButton } from '@/components/export-button';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Transaction } from '@/lib/types';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { autoProcessSyncedTransactions, type AutoProcessState } from '@/lib/actions';


function AutoProcessButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <Bot className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Processing...' : 'Auto-Process Deposits'}
        </Button>
    )
}

function AutoProcessForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<AutoProcessState, FormData>(autoProcessSyncedTransactions, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Processing Failed' : 'Processing Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <AutoProcessButton />
        </form>
    );
}


export default function TransactionsPage() {
    const [transactions, setTransactions] = React.useState<Transaction[]>([]);
    const [loading, setLoading] = React.useState(true);
    // This state will hold the filtered and sorted data from the table for export
    const [exportData, setExportData] = React.useState<Transaction[]>([]);

    React.useEffect(() => {
        const transactionsRef = ref(db, 'transactions/');
        const unsubscribe = onValue(transactionsRef, (snapshot) => {
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
        });

        return () => unsubscribe();
    }, []);

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
        <>
            <PageHeader 
                title="Transactions"
                description="Manage all financial transactions."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <AutoProcessForm />
                    <SyncButton />
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
                    <Button asChild>
                        <Link href="/transactions/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Transaction
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <TransactionsTable 
                transactions={transactions} 
                loading={loading}
                onFilteredDataChange={setExportData}
            />
        </>
    );
}
