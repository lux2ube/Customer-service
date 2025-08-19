

'use client';

import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { DollarSign, Activity, Users, ArrowRight, UserPlus, ShieldAlert, Network, PlusCircle, Repeat, RefreshCw, Bot, Users2, History, Link2, ArrowDownToLine, ArrowUpFromLine, DatabaseZap, ListTree, Database, Download } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue, query, limitToLast, get, startAt, orderByChild } from 'firebase/database';
import type { Client, Transaction, Account, SmsParsingRule, SmsEndpoint } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { format, startOfDay, subDays, parseISO, eachDayOfInterval, sub, startOfWeek, endOfWeek, subWeeks, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { syncBscTransactions, processIncomingSms, migrateBep20Addresses, type SyncState, type ProcessSmsState, type SetupState, setupClientParentAccount, backfillCashRecordUsd } from '@/lib/actions';
import { DashboardChart } from '@/components/dashboard-chart';
import { ExportJsonButton } from '@/components/export-json-button';

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
    const isCredit = tx.type === 'Withdraw'; // In this context, Withdraw = client sells USDT, an inflow to us
    const totalAmount = tx.summary?.total_inflow_usd || 0;
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
                isCredit ? "text-green-600" : "" // Only color inflows, not outflows from us
            )}>
                <p>${new Intl.NumberFormat('en-US').format(totalAmount)}</p>
                <p className="text-xs font-normal text-muted-foreground">USD</p>
            </div>
        </div>
    )
};


// --- Action Button Components ---

function ActionButton({ Icon, text, pendingText, variant = "outline" }: { Icon: React.ElementType, text: string, pendingText: string, variant?: "outline" | "destructive" | "default" | "secondary" }) {
    const { pending } = useFormStatus();
    return (
        <Button variant={variant} type="submit" disabled={pending} className="flex-1 min-w-[200px]">
            <Icon className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? pendingText : text}
        </Button>
    )
}

function ProcessSmsForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<ProcessSmsState, FormData>(processIncomingSms, undefined);
    React.useEffect(() => { if (state?.message) toast({ title: state.error ? 'Processing Failed' : 'Processing Complete', description: state.message, variant: state.error ? 'destructive' : 'default' }); }, [state, toast]);
    return <form action={formAction}><ActionButton Icon={RefreshCw} text="Process Incoming SMS" pendingText="Processing..." /></form>;
}

function SetupClientParentAccountForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SetupState, FormData>(setupClientParentAccount, undefined);
    React.useEffect(() => { if (state?.message) toast({ title: state.error ? 'Setup Failed' : 'Setup Complete', description: state.message, variant: state.error ? 'destructive' : 'default' }); }, [state, toast]);
    return <form action={formAction}><ActionButton Icon={Network} text="Setup Client Accounts" pendingText="Setting up..." variant="destructive" /></form>;
}

function MigrateBep20Form() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SetupState, FormData>(migrateBep20Addresses, undefined);
    React.useEffect(() => { if (state?.message) toast({ title: state.error ? 'Migration Failed' : 'Migration Complete', description: state.message, variant: state.error ? 'destructive' : 'default' }); }, [state, toast]);
    return <form action={formAction}><ActionButton Icon={Users} text="Migrate BEP20 Addresses" pendingText="Migrating..." /></form>;
}

function BackfillCashUsdForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SetupState, FormData>(backfillCashRecordUsd, undefined);
    React.useEffect(() => { if (state?.message) toast({ title: state.error ? 'Backfill Failed' : 'Backfill Complete', description: state.message, variant: state.error ? 'destructive' : 'default' }); }, [state, toast]);
    return <form action={formAction}><ActionButton Icon={DatabaseZap} text="Backfill Cash USD Values" pendingText="Processing..." /></form>;
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
    
    const [totalDeposits, setTotalDeposits] = React.useState(0);
    const [totalWithdrawals, setTotalWithdrawals] = React.useState(0);

    const [dailyVolumeData, setDailyVolumeData] = React.useState<{ name: string; value: number }[]>([]);
    
    // State for exportable data
    const [exportableClients, setExportableClients] = React.useState<any>(null);
    const [exportableAccounts, setExportableAccounts] = React.useState<any>(null);
    const [exportableParsingRules, setExportableParsingRules] = React.useState<any>(null);
    const [exportableGateways, setExportableGateways] = React.useState<any>(null);


    React.useEffect(() => {
        const clientsRef = ref(db, 'clients');
        const transactionsRef = ref(db, 'modern_transactions');
        
        const unsubs: (() => void)[] = [];

        // --- Data Fetching for Exports ---
        get(clientsRef).then(snap => snap.exists() && setExportableClients(snap.val()));
        get(ref(db, 'accounts')).then(snap => snap.exists() && setExportableAccounts(snap.val()));
        get(ref(db, 'sms_parsing_rules')).then(snap => snap.exists() && setExportableParsingRules(snap.val()));
        get(ref(db, 'sms_endpoints')).then(snap => snap.exists() && setExportableGateways(snap.val()));


        // Fetch last 5 transactions for display without relying on server-side sort
        unsubs.push(onValue(query(transactionsRef, limitToLast(20)), (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                // Sort client-side now
                list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setRecentTransactions(list.slice(0, 5));
            }
        }));

        unsubs.push(onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const thirtyDaysAgo = subDays(new Date(), 30).getTime();
                const allTxs: Transaction[] = Object.values(data);
                
                const confirmedTxs = allTxs.filter(tx => tx.status === 'Confirmed' && tx.date && tx.summary);
                const recentConfirmedTxs = confirmedTxs.filter(tx => tx.createdAt && parseISO(tx.createdAt).getTime() >= thirtyDaysAgo);

                // --- Deposit/Withdrawal Stats (Last 30 Days) ---
                const deposits = recentConfirmedTxs
                    .filter(tx => tx.type === 'Deposit')
                    .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);

                const withdrawals = recentConfirmedTxs
                    .filter(tx => tx.type === 'Withdraw')
                    .reduce((sum, tx) => sum + tx.summary.total_outflow_usd, 0); // Correctly sum outflow for withdrawals

                setTotalDeposits(deposits);
                setTotalWithdrawals(withdrawals);

                // --- Daily Stats ---
                const todayStart = startOfDay(new Date());
                const yesterdayStart = startOfDay(subDays(new Date(), 1));

                const todayVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= todayStart)
                    .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);

                const yesterdayVolume = confirmedTxs
                    .filter(tx => {
                        const txDate = parseISO(tx.date);
                        return txDate >= yesterdayStart && txDate < todayStart;
                    })
                    .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);

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
                    .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);

                const lastWeekVolume = confirmedTxs
                    .filter(tx => parseISO(tx.date) >= lastWeekStart && parseISO(tx.date) <= lastWeekEnd)
                    .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);
                
                setTotalVolumeThisWeek(thisWeekVolume);
                if (lastWeekVolume > 0) {
                    const percentChange = ((thisWeekVolume - lastWeekVolume) / lastWeekVolume) * 100;
                    setWeekOverWeekChange(`${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}% from last week`);
                } else {
                    setWeekOverWeekChange('vs $0 last week');
                }
                
                // --- Daily Volume Chart Data (Last 7 Days) ---
                const last7Days = eachDayOfInterval({
                    start: sub(new Date(), { days: 6 }),
                    end: new Date()
                });

                const dailyData = last7Days.map(day => {
                    const dayStart = startOfDay(day);
                    const dayEnd = endOfDay(day);
                    const volume = confirmedTxs
                        .filter(tx => {
                            const txDate = parseISO(tx.date);
                            return txDate >= dayStart && txDate <= dayEnd;
                        })
                        .reduce((sum, tx) => sum + tx.summary.total_inflow_usd, 0);
                    return {
                        name: format(day, 'E'), // e.g., 'Mon'
                        value: volume,
                    };
                });
                setDailyVolumeData(dailyData);
                
                // --- Global Stats ---
                const pending = allTxs.filter(tx => tx.status === 'Pending').length;
                setPendingTxs(pending);
            } else {
                // If no transactions exist at all
                setPendingTxs(0);
                setTotalDeposits(0);
                setTotalWithdrawals(0);
                setTotalVolumeToday(0);
                setTotalVolumeThisWeek(0);
                setDayOverDayChange(null);
                setWeekOverWeekChange(null);
                setDailyVolumeData([]);
            }
        }));

        unsubs.push(onValue(clientsRef, (snapshot) => {
            setClientCount(snapshot.exists() ? snapshot.size : 0);
        }));
        
        // Mark loading as false after initial data load
        Promise.all([
            get(query(transactionsRef, limitToLast(5))), 
            get(clientsRef)
        ]).then(() => setLoading(false));

        return () => unsubs.forEach(unsub => unsub());
    }, []);

    const quickAccessActions = [
        { title: 'Add Client', icon: UserPlus, href: '/clients/add' },
        { title: 'New Transaction', icon: PlusCircle, href: '/transactions/modern' },
        { title: 'Chart of Accounts', icon: Network, href: '/accounting/chart-of-accounts' },
        { title: 'Blacklist', icon: ShieldAlert, href: '/blacklist' },
    ];

    return (
        <div className="space-y-6">

             <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Total Clients" value={clientCount.toLocaleString()} icon={Users} loading={loading} />
                <StatCard title="Deposits (30d)" value={`$${totalDeposits.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={ArrowDownToLine} loading={loading} />
                <StatCard title="Withdrawals (30d)" value={`$${totalWithdrawals.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={ArrowUpFromLine} loading={loading} />
                <StatCard title="Pending Transactions" value={pendingTxs.toLocaleString()} icon={Activity} loading={loading} />
                <StatCard title="Volume Today" value={`$${totalVolumeToday.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={DollarSign} loading={loading} subText={dayOverDayChange || ''} />
                <StatCard title="Volume This Week" value={`$${totalVolumeThisWeek.toLocaleString('en-US', {maximumFractionDigits: 0})}`} icon={DollarSign} loading={loading} subText={weekOverWeekChange || ''} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Daily Volume (Last 7 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? <Skeleton className="h-[300px] w-full" /> : <DashboardChart data={dailyVolumeData} />}
                    </CardContent>
                </Card>
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>System Actions</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                            <ProcessSmsForm />
                            <BackfillCashUsdForm />
                            </div>
                            <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                            <SetupClientParentAccountForm />
                            <MigrateBep20Form />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Data Export</CardTitle>
                            <CardDescription>Download core system data as JSON files.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-2">
                           <ExportJsonButton data={exportableClients} filename="clients.json"><Users className="mr-2 h-4 w-4" /> Export Clients</ExportJsonButton>
                           <ExportJsonButton data={exportableAccounts} filename="chart_of_accounts.json"><Network className="mr-2 h-4 w-4" /> Export Accounts</ExportJsonButton>
                           <ExportJsonButton data={exportableParsingRules} filename="sms_parsing_rules.json"><Bot className="mr-2 h-4 w-4" /> Export Parsing Rules</ExportJsonButton>
                           <ExportJsonButton data={exportableGateways} filename="sms_gateways.json"><Download className="mr-2 h-4 w-4" /> Export Gateways</ExportJsonButton>
                        </CardContent>
                    </Card>
                </div>
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
