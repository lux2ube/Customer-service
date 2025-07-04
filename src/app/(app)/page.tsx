'use client';

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, Banknote, Users, Activity } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Client, Transaction } from '@/lib/types';

export default function DashboardPage() {
    const [totalClients, setTotalClients] = React.useState(0);
    const [totalDeposits, setTotalDeposits] = React.useState(0);
    const [totalWithdrawals, setTotalWithdrawals] = React.useState(0);
    const [pendingTransactions, setPendingTransactions] = React.useState(0);

    React.useEffect(() => {
        // Fetch clients
        const clientsRef = ref(db, 'clients');
        const unsubscribeClients = onValue(clientsRef, (snapshot) => {
            const data = snapshot.val();
            setTotalClients(data ? Object.keys(data).length : 0);
        });

        // Fetch transactions
        const transactionsRef = ref(db, 'transactions');
        const unsubscribeTransactions = onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const transactions: Transaction[] = Object.values(data);
                const deposits = transactions
                    .filter(t => t.type === 'Deposit' && t.status === 'Confirmed' && t.amount_usd)
                    .reduce((sum, t) => sum + t.amount_usd!, 0);
                
                const withdrawals = transactions
                    .filter(t => t.type === 'Withdraw' && t.status === 'Confirmed' && t.amount_usd)
                    .reduce((sum, t) => sum + t.amount_usd!, 0);

                const pending = transactions.filter(t => t.status === 'Pending').length;

                setTotalDeposits(deposits);
                setTotalWithdrawals(withdrawals);
                setPendingTransactions(pending);
            } else {
                setTotalDeposits(0);
                setTotalWithdrawals(0);
                setPendingTransactions(0);
            }
        });

        return () => {
            unsubscribeClients();
            unsubscribeTransactions();
        };
    }, []);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Overview of your financial and CRM operations."
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Deposits</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalDeposits)}</div>
                        <p className="text-xs text-muted-foreground">Sum of all confirmed deposits</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Withdrawals</CardTitle>
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatCurrency(totalWithdrawals)}</div>
                        <p className="text-xs text-muted-foreground">Sum of all confirmed withdrawals</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalClients}</div>
                        <p className="text-xs text-muted-foreground">Total number of clients</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Pending Transactions</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingTransactions}</div>
                        <p className="text-xs text-muted-foreground">Transactions needing review</p>
                    </CardContent>
                </Card>
            </div>
             <div className="mt-8 text-center">
                <p className="text-lg text-muted-foreground">Welcome to your Financial CRM!</p>
                <p className="text-sm text-muted-foreground">Select a module from the sidebar to get started.</p>
            </div>
        </>
    );
}
