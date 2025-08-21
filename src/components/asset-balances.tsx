
'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Account, JournalEntry, ServiceProvider } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableHead, TableRow } from './ui/table';
import { cn } from '@/lib/utils';

interface AssetBalance {
    id: string;
    name: string;
    currency: string;
    balance: number;
}

interface GroupedBalances {
    [providerName: string]: AssetBalance[];
}

export function AssetBalances() {
    const [balances, setBalances] = React.useState<GroupedBalances>({});
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const journalRef = ref(db, 'journal_entries');
        const providersRef = ref(db, 'service_providers');

        const unsubProviders = onValue(providersRef, (provSnapshot) => {
            const allProviders: Record<string, ServiceProvider> = provSnapshot.val() || {};
            
            const unsubAccounts = onValue(accountsRef, (accSnapshot) => {
                if (!accSnapshot.exists()) {
                    setLoading(false);
                    return;
                }
                const allAccounts: Record<string, Account> = accSnapshot.val();
                const assetAccounts = Object.values(allAccounts).filter(acc => acc.type === 'Assets' && !acc.isGroup);

                const unsubJournal = onValue(journalRef, (journalSnapshot) => {
                    const accountBalances: Record<string, number> = {};
                    assetAccounts.forEach(acc => accountBalances[acc.id] = 0);

                    if (journalSnapshot.exists()) {
                        const allEntries: Record<string, JournalEntry> = journalSnapshot.val();
                        for (const key in allEntries) {
                            const entry = allEntries[key];
                            if (accountBalances[entry.debit_account] !== undefined) {
                                accountBalances[entry.debit_account] += entry.debit_amount;
                            }
                            if (accountBalances[entry.credit_account] !== undefined) {
                                accountBalances[entry.credit_account] -= entry.credit_amount;
                            }
                        }
                    }

                    const newGroupedBalances: GroupedBalances = {};
                    
                    // Group accounts by provider
                    Object.values(allProviders).forEach(provider => {
                        newGroupedBalances[provider.name] = [];
                        provider.accountIds.forEach(accountId => {
                            const account = allAccounts[accountId];
                            if (account && account.type === 'Assets' && !account.isGroup) {
                                newGroupedBalances[provider.name].push({
                                    id: account.id,
                                    name: account.name,
                                    currency: account.currency || 'N/A',
                                    balance: accountBalances[account.id] || 0
                                });
                            }
                        });
                         newGroupedBalances[provider.name].sort((a,b) => a.name.localeCompare(b.name));
                    });

                    // Handle ungrouped accounts
                    newGroupedBalances['Other Assets'] = [];
                    const groupedAccountIds = new Set(Object.values(allProviders).flatMap(p => p.accountIds));
                    assetAccounts.forEach(account => {
                        if (!groupedAccountIds.has(account.id)) {
                             newGroupedBalances['Other Assets'].push({
                                id: account.id,
                                name: account.name,
                                currency: account.currency || 'N/A',
                                balance: accountBalances[account.id] || 0
                            });
                        }
                    });
                     newGroupedBalances['Other Assets'].sort((a,b) => a.name.localeCompare(b.name));
                     if (newGroupedBalances['Other Assets'].length === 0) {
                        delete newGroupedBalances['Other Assets'];
                     }


                    setBalances(newGroupedBalances);
                    setLoading(false);
                });

                return () => unsubJournal();
            });
             return () => unsubAccounts();
        });


        return () => unsubProviders();
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Asset Balances</CardTitle>
                <CardDescription>Real-time overview of all asset accounts by provider.</CardDescription>
            </CardHeader>
            <CardContent>
                 <div className="space-y-4">
                    {loading ? (
                       [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                    ) : Object.keys(balances).length > 0 ? (
                       Object.entries(balances).map(([providerName, providerBalances]) => (
                           <div key={providerName}>
                               <h4 className="font-semibold text-sm mb-1 px-1">{providerName}</h4>
                               <div className="rounded-md border p-1">
                                    <div className="space-y-1">
                                        {providerBalances.map(asset => (
                                            <div key={asset.id} className={cn(
                                                "flex justify-between items-center p-2 rounded-md text-xs",
                                                asset.balance > 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"
                                            )}>
                                                <span className="font-medium truncate">{asset.name}</span>
                                                <span className="font-mono whitespace-nowrap">
                                                    {asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-muted-foreground ml-1">{asset.currency}</span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                               </div>
                           </div>
                       ))
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-10">No asset accounts found.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
