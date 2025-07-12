
'use client';

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, Banknote, Users, Activity, ArrowRight, Wallet, ShoppingBag, Gamepad2, Phone, Repeat, CircleDollarSign } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast, get } from 'firebase/database';
import type { Client, Transaction, Account } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { JaibLogo } from '@/components/jaib-logo';
import { IbnJaberLogo } from '@/components/ibn-jaber-logo';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const StatCard = ({ title, value, icon: Icon, loading }: { title: string, value: string, icon: React.ElementType, loading: boolean }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {loading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{value}</div>}
        </CardContent>
    </Card>
);

const ActionCard = ({ title, icon: Icon, href }: { title: string, icon: React.ElementType, href: string }) => (
    <Link href={href} className="block">
        <Card className="group hover:shadow-lg transition-shadow duration-200 h-full flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 p-3 rounded-full bg-secondary">
                <Icon className="h-6 w-6 text-foreground/80" />
            </div>
            <p className="text-sm font-semibold">{title}</p>
        </Card>
    </Link>
);


const TransactionItem = ({ tx }: { tx: Transaction }) => {
    const isCredit = tx.type === 'Withdraw'; // In this context, Withdraw = credit to us
    return (
        <div className="flex items-center gap-4 py-3">
             <div className="p-3 bg-secondary rounded-full">
                <Repeat className="h-5 w-5 text-foreground/70" />
            </div>
            <div className="flex-1">
                <p className="font-semibold">{tx.clientName}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(tx.date), "dd/MM/yyyy (HH:mm)")}</p>
            </div>
            <div className={cn(
                "font-bold text-right",
                isCredit ? "text-green-600" : "text-red-600"
            )}>
                <p>{isCredit ? '' : '-'}{new Intl.NumberFormat('en-US').format(tx.amount_usd)}</p>
                <p className="text-xs font-normal text-muted-foreground">{tx.currency}</p>
            </div>
        </div>
    )
}

export default function DashboardPage() {
    const [recentTransactions, setRecentTransactions] = React.useState<Transaction[]>([]);
    const [clientCount, setClientCount] = React.useState(0);
    const [totalUsd, setTotalUsd] = React.useState(0);
    const [pendingTxs, setPendingTxs] = React.useState(0);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const transactionsRef = ref(db, 'transactions');
        const clientsRef = ref(db, 'clients');
        const accountsRef = ref(db, 'accounts');
        
        const recentTxQuery = query(transactionsRef, orderByChild('createdAt'), limitToLast(5));
        
        const unsubs: (() => void)[] = [];

        unsubs.push(onValue(recentTxQuery, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.values(data);
                list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setRecentTransactions(list);
            }
        }));

        unsubs.push(onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.values(data);
                const total = list.reduce((sum, tx) => tx.status === 'Confirmed' ? sum + tx.amount_usd : sum, 0);
                const pending = list.filter(tx => tx.status === 'Pending').length;
                setTotalUsd(total);
                setPendingTxs(pending);
            }
        }));

        unsubs.push(onValue(clientsRef, (snapshot) => {
            setClientCount(snapshot.exists() ? snapshot.size : 0);
        }));

        unsubs.push(onValue(accountsRef, (snapshot) => {
             if (snapshot.exists()) {
                 const allAccounts: Account[] = Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] }));
                 setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
                 setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
             }
        }));
        
        // Mark loading as false after initial data load
        Promise.all([
            get(recentTxQuery), 
            get(transactionsRef), 
            get(clientsRef),
            get(accountsRef)
        ]).then(() => setLoading(false));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const actions = [
        { title: 'Topup and Payments', icon: Phone, href: '/transactions/add' },
        { title: 'Hazmi Tahweel', icon: IbnJaberLogo, href: '/transactions' },
        { title: 'Transfers', icon: Repeat, href: '/transactions' },
        { title: 'Cash Out', icon: CircleDollarSign, href: '/transactions/add' },
        { title: 'Purchases', icon: ShoppingBag, href: '/transactions' },
        { title: 'Online Purchase', icon: Wallet, href: '/transactions/add' },
        { title: 'Jaibe', icon: JaibLogo, href: '/clients' },
        { title: 'Entertainment', icon: Gamepad2, href: '#' },
        { title: 'Payments', icon: DollarSign, href: '/transactions' },
    ];

    return (
        <div className="space-y-6">

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Total Clients" value={clientCount.toLocaleString()} icon={Users} loading={loading} />
                <StatCard title="Total Volume (USD)" value={`$${totalUsd.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={DollarSign} loading={loading} />
                <StatCard title="Pending Transactions" value={pendingTxs.toLocaleString()} icon={Activity} loading={loading} />
            </div>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                {actions.map(action => <ActionCard key={action.title} {...action} />)}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Transactions</CardTitle>
                        <Button variant="ghost" size="sm" asChild>
                           <Link href="/transactions">
                             View All <ArrowRight className="ml-2 h-4 w-4" />
                           </Link>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="divide-y">
                   {loading && recentTransactions.length === 0 ? (
                       [...Array(3)].map((_, i) => (
                           <div key={i} className="flex items-center gap-4 py-3">
                               <Skeleton className="h-12 w-12 rounded-full" />
                               <div className="flex-1 space-y-2">
                                   <Skeleton className="h-4 w-3/4" />
                                   <Skeleton className="h-3 w-1/2" />
                               </div>
                               <div className="text-right space-y-2">
                                   <Skeleton className="h-4 w-16" />
                                   <Skeleton className="h-3 w-10" />
                               </div>
                           </div>
                       ))
                   ) : recentTransactions.length > 0 ? (
                       recentTransactions.map(tx => <TransactionItem key={tx.id} tx={tx} />)
                   ) : (
                       <p className="text-muted-foreground text-center py-8">No recent transactions.</p>
                   )}
                </CardContent>
            </Card>
        </div>
    );
}
