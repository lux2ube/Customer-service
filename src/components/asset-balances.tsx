'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, JournalEntry, ServiceProvider } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
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

    const loadBalances = React.useCallback(async () => {
        try {
            const [settingsSnap, providersSnap, accountsSnap, journalSnap] = await Promise.all([
                get(ref(db, 'settings')),
                get(ref(db, 'service_providers')),
                get(ref(db, 'accounts')),
                get(ref(db, 'journal_entries'))
            ]);

            const settings = settingsSnap.val() || {};
            const financialPeriodStartDate = settings.financialPeriodStartDate ? new Date(settings.financialPeriodStartDate) : null;
            const allProviders: Record<string, ServiceProvider> = providersSnap.val() || {};

            if (!accountsSnap.exists()) {
                setBalances({});
                setLoading(false);
                return;
            }

            const allAccounts: Record<string, Account> = accountsSnap.val();
            const assetAccounts = Object.values(allAccounts).filter(acc => acc && acc.type === 'Assets' && !acc.isGroup);
            
            const accountBalances: Record<string, number> = {};
            assetAccounts.forEach(acc => {
                if (acc && acc.id) {
                    accountBalances[acc.id] = 0;
                }
            });

            if (journalSnap.exists()) {
                const allEntries: Record<string, JournalEntry> = journalSnap.val();
                for (const key in allEntries) {
                    const entry = allEntries[key];
                    if (!entry) continue;
                    
                    if (financialPeriodStartDate) {
                        const entryDate = entry.createdAt ? new Date(entry.createdAt) : null;
                        if (!entryDate || entryDate < financialPeriodStartDate) {
                            continue;
                        }
                    }
                    
                    if (entry.debit_account && accountBalances[entry.debit_account] !== undefined) {
                        accountBalances[entry.debit_account] += (entry.debit_amount || 0);
                    }
                    if (entry.credit_account && accountBalances[entry.credit_account] !== undefined) {
                        accountBalances[entry.credit_account] -= (entry.credit_amount || 0);
                    }
                }
            }

            const newGroupedBalances: GroupedBalances = {};
            
            Object.values(allProviders).forEach(provider => {
                if (!provider || !provider.name || !provider.accountIds) return;
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

            newGroupedBalances['Other Assets'] = [];
            const groupedAccountIds = new Set(Object.values(allProviders).flatMap(p => p?.accountIds || []));
            assetAccounts.forEach(account => {
                if (account && account.id && !groupedAccountIds.has(account.id)) {
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
        } catch (error) {
            console.error('Error calculating asset balances:', error);
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        loadBalances();
        const interval = setInterval(loadBalances, 30000);
        return () => clearInterval(interval);
    }, [loadBalances]);

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
                                            <div key={asset.id} className="flex justify-between items-center p-2 rounded-md text-xs">
                                                <span className="font-medium truncate">{asset.name}</span>
                                                <div className={cn(
                                                    "font-mono whitespace-nowrap",
                                                    asset.balance > 0.01 ? 'text-green-600' : asset.balance < -0.01 ? 'text-red-600' : 'text-muted-foreground'
                                                )}>
                                                    {asset.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    <span className="text-muted-foreground ml-1">{asset.currency}</span>
                                                </div>
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
