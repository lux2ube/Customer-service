
'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Account, JournalEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '@/lib/utils';

interface AssetBalance {
    id: string;
    name: string;
    currency: string;
    balance: number;
}

export function AssetBalances() {
    const [balances, setBalances] = React.useState<AssetBalance[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const journalRef = ref(db, 'journal_entries');

        const unsubAccounts = onValue(accountsRef, (accSnapshot) => {
            if (!accSnapshot.exists()) {
                setLoading(false);
                return;
            }
            const allAccounts: Record<string, Account> = accSnapshot.val();
            const assetAccounts = Object.values(allAccounts).filter(acc => acc.type === 'Assets' && !acc.isGroup);

            const unsubJournal = onValue(journalRef, (journalSnapshot) => {
                const newBalances: AssetBalance[] = assetAccounts.map(account => ({
                    id: account.id,
                    name: account.name,
                    currency: account.currency || 'N/A',
                    balance: 0,
                }));
                const balanceMap = new Map<string, number>(newBalances.map(b => [b.id, 0]));

                if (journalSnapshot.exists()) {
                    const allEntries: Record<string, JournalEntry> = journalSnapshot.val();
                    for (const key in allEntries) {
                        const entry = allEntries[key];
                        if (balanceMap.has(entry.debit_account)) {
                            balanceMap.set(entry.debit_account, (balanceMap.get(entry.debit_account) || 0) + entry.debit_amount);
                        }
                        if (balanceMap.has(entry.credit_account)) {
                            balanceMap.set(entry.credit_account, (balanceMap.get(entry.credit_account) || 0) - entry.credit_amount);
                        }
                    }
                }
                
                const finalBalances = newBalances.map(b => ({
                    ...b,
                    balance: balanceMap.get(b.id) || 0,
                })).sort((a,b) => b.balance - a.balance);

                setBalances(finalBalances);
                setLoading(false);
            });

            // Cleanup journal listener when accounts listener re-runs or component unmounts
            return () => unsubJournal();
        });

        // Cleanup accounts listener on component unmount
        return () => unsubAccounts();
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Asset Balances</CardTitle>
                <CardDescription>Real-time overview of all asset accounts.</CardDescription>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-72 pr-3">
                    <div className="space-y-2">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <div key={i} className="flex justify-between items-center p-2 rounded-md">
                                    <Skeleton className="h-4 w-2/4" />
                                    <Skeleton className="h-4 w-1/4" />
                                </div>
                            ))
                        ) : balances.length > 0 ? (
                            balances.map(asset => (
                                <div key={asset.id} className={cn(
                                    "flex justify-between items-center p-2 rounded-md",
                                    asset.balance > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"
                                )}>
                                    <p className="text-xs font-medium truncate pr-2">{asset.name}</p>
                                    <p className="font-mono text-[11px] font-semibold whitespace-nowrap">
                                        {asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span className="text-muted-foreground ml-1">{asset.currency}</span>
                                    </p>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground text-center py-10">No asset accounts found.</p>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
