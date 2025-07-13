
'use client';

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, Activity, Users, ArrowRight, UserPlus, ShieldAlert, Network, PlusCircle, Repeat } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue, query, limitToLast, get } from 'firebase/database';
import type { Client, Transaction, Account } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfDay, subDays, startOfDay, subWeeks, parseISO, endOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const StatCard = ({ title, value, icon: Icon, loading, subText }: { title: string, value: string, icon: React.ElementType, loading: boolean, subText?: string }) => (
    <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
            {loading ? <Skeleton className="h-8 w-3/4" /> : <div className="text-2xl font-bold">{value}</div>}
            {loading ? <Skeleton className="h-4 w-1/2 mt-1" /> : (subText && <p className="text-xs text-muted-foreground">{subText}</p>)}
        </CardContent>
    </Card>
);

const ActionCard = ({ title, icon: Icon, href }: { title: string, icon: React.ElementType, href: string }) => (
    <Link href={href} className="block">
        <Card className="group hover:shadow-lg transition-shadow duration-200 h-full flex flex-col items-center justify-center p-4 text-center">
            <div className="mb-2 p-3 rounded-full bg-primary/10">
                <Icon className="h-6 w-6 text-primary" />
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
                <p className="text-xs text-muted-foreground">{tx.date && !isNaN(new Date(tx.date).getTime()) ? format(new Date(tx.date), "dd/MM/yyyy (HH:mm)") : 'Invalid Date'}</p>
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
    const [pendingTxs, setPendingTxs] = React.useState(0);
    const [loading, setLoading] = React.useState(true);

    const [totalVolumeToday, setTotalVolumeToday] = React.useState(0);
    const [dayOverDayChange, setDayOverDayChange] = React.useState<string | null>(null);

    const [totalVolumeThisWeek, setTotalVolumeThisWeek] = React.useState(0);
    const [weekOverWeekChange, setWeekOverWeekChange] = React.useState<string | null>(null);


    React.useEffect(() => {
        const transactionsRef = ref(db, 'transactions');
        const clientsRef = ref(db, 'clients');
        
        const recentTxQuery = query(transactionsRef, limitToLast(5));
        
        const unsubs: (() => void)[] = [];

        unsubs.push(onValue(recentTxQuery, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setRecentTransactions(list);
            }
        }));

        unsubs.push(onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const allTxs: Transaction[] = Object.values(data);
                const confirmedTxs = allTxs.filter(tx => tx.status === 'Confirmed' && tx.date);

                // --- Daily Stats ---
                const todayStart = startOfDay(new Date());
                const todayEnd = endOfDay(new Date());
                const yesterdayStart = startOfDay(subDays(new Date(), 1));
                const yesterdayEnd = endOfDay(subDays(new Date(), 1));

                const todayVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= todayStart && parseISO(tx.date) <= todayEnd)
                    .reduce((sum, tx) => sum + tx.amount_usd, 0);

                const yesterdayVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= yesterdayStart && parseISO(tx.date) <= yesterdayEnd)
                    .reduce((sum, tx) => sum + tx.amount_usd, 0);

                setTotalVolumeToday(todayVolume);
                if (yesterdayVolume > 0) {
                    const percentChange = ((todayVolume - yesterdayVolume) / yesterdayVolume) * 100;
                    setDayOverDayChange(`${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}% from yesterday`);
                } else {
                    setDayOverDayChange('vs $0 yesterday');
                }

                 // --- Weekly Stats ---
                const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
                const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
                const lastWeekEnd = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
                
                const thisWeekVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= thisWeekStart)
                    .reduce((sum, tx) => sum + tx.amount_usd, 0);

                const lastWeekVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= lastWeekStart && parseISO(tx.date) <= lastWeekEnd)
                    .reduce((sum, tx) => sum + tx.amount_usd, 0);
                
                setTotalVolumeThisWeek(thisWeekVolume);
                if (lastWeekVolume > 0) {
                    const percentChange = ((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100;
                    setWeekOverWeekChange(`${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}% from last week`);
                } else {
                    setWeekOverWeekChange('vs $0 last week');
                }
                
                // --- Global Stats ---
                const pending = allTxs.filter(tx => tx.status === 'Pending').length;
                setPendingTxs(pending);
            }
        }));

        unsubs.push(onValue(clientsRef, (snapshot) => {
            setClientCount(snapshot.exists() ? snapshot.size : 0);
        }));
        
        // Mark loading as false after initial data load
        Promise.all([
            get(recentTxQuery), 
            get(transactionsRef), 
            get(clientsRef)
        ]).then(() => setLoading(false));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const quickAccessActions = [
        { title: 'Add Client', icon: UserPlus, href: '/clients/add' },
        { title: 'Add Transaction', icon: PlusCircle, href: '/transactions/add' },
        { title: 'Chart of Accounts', icon: Network, href: '/accounting/chart-of-accounts' },
        { title: 'Blacklist', icon: ShieldAlert, href: '/blacklist' },
    ];

    return (
        <div className="space-y-6">

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Total Clients" value={clientCount.toLocaleString()} icon={Users} loading={loading} />
                <StatCard title="Pending Transactions" value={pendingTxs.toLocaleString()} icon={Activity} loading={loading} />
                <StatCard title="Volume Today" value={`$${totalVolumeToday.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={DollarSign} loading={loading} subText={dayOverDayChange || ''} />
                <StatCard title="Volume This Week" value={`$${totalVolumeThisWeek.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={DollarSign} loading={loading} subText={weekOverWeekChange || ''} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {quickAccessActions.map(action => <ActionCard key={action.title} {...action} />)}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Recent Transactions</CardTitle>
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
