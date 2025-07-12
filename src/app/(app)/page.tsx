
'use client';

import React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DollarSign, Banknote, Users, Activity, ArrowRight, Wallet, ShoppingBag, Gamepad2, Phone, Repeat, CircleDollarSign } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import type { Client, Transaction } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { JaibLogo } from '@/components/jaib-logo';
import { IbnJaberLogo } from '@/components/ibn-jaber-logo';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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

    React.useEffect(() => {
        const transactionsRef = query(ref(db, 'transactions'), orderByChild('createdAt'), limitToLast(5));
        const unsubscribe = onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Transaction[] = Object.values(data);
                list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setRecentTransactions(list);
            }
        });

        return () => unsubscribe();
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
                   {recentTransactions.length > 0 ? (
                       recentTransactions.map(tx => <TransactionItem key={tx.id} tx={tx} />)
                   ) : (
                       <p className="text-muted-foreground text-center py-8">No recent transactions.</p>
                   )}
                </CardContent>
            </Card>
        </div>
    );
}
