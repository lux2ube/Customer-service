'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Transaction } from '@/lib/types';

export default function DashboardPage() {
    const [clientCount, setClientCount] = useState<number>(0);
    const [loadingClients, setLoadingClients] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(true);

    useEffect(() => {
        const usersRef = ref(db, 'users');
        const unsubscribeClients = onValue(usersRef, (snapshot) => {
            setClientCount(snapshot.size);
            setLoadingClients(false);
        });

        const transactionsRef = ref(db, 'transactions');
        const unsubscribeTransactions = onValue(transactionsRef, (snapshot) => {
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
            setLoadingTransactions(false);
        });

        // Cleanup subscription on unmount
        return () => {
            unsubscribeClients();
            unsubscribeTransactions();
        };
    }, []);

    const { totalDeposit, totalWithdraw } = useMemo(() => {
        return transactions.reduce((acc, tx) => {
            // Only sum up confirmed transactions
            if (tx.status === 'Confirmed') {
                if (tx.type === 'Deposit') {
                    // Assuming amount is a number, not a string
                    acc.totalDeposit += Number(tx.amount) || 0;
                } else if (tx.type === 'Withdraw') {
                    acc.totalWithdraw += Number(tx.amount) || 0;
                }
            }
            return acc;
        }, { totalDeposit: 0, totalWithdraw: 0 });
    }, [transactions]);
    
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(value);
    };

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Overview of your financial operations."
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loadingClients ? (
                             <div className="text-2xl font-bold">-</div>
                        ) : (
                            <div className="text-2xl font-bold">{clientCount}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Live count from Firebase</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Deposit</CardTitle>
                        <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                       {loadingTransactions ? (
                            <div className="text-2xl font-bold">-</div>
                        ) : (
                            <div className="text-2xl font-bold">{formatCurrency(totalDeposit)}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Calculated from transactions</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Withdraw</CardTitle>
                        <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                       {loadingTransactions ? (
                            <div className="text-2xl font-bold">-</div>
                        ) : (
                             <div className="text-2xl font-bold">{formatCurrency(totalWithdraw)}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Calculated from transactions</p>
                    </CardContent>
                </Card>
            </div>
             <div className="mt-8 text-center">
                <p className="text-lg text-muted-foreground">Welcome to Customer Central!</p>
                <p className="text-sm text-muted-foreground">Select a module from the sidebar to get started.</p>
            </div>
        </>
    );
}
