'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account, JournalEntry } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { cn } from '@/lib/utils';

interface LiabilityBalance {
    id: string;
    name: string;
    balance: number;
}

export function LiabilityBalances() {
    const [balances, setBalances] = React.useState<LiabilityBalance[]>([]);
    const [loading, setLoading] = React.useState(true);

    const loadBalances = React.useCallback(async () => {
        try {
            const [settingsSnap, accountsSnap, journalSnap] = await Promise.all([
                get(ref(db, 'settings')),
                get(ref(db, 'accounts')),
                get(ref(db, 'journal_entries'))
            ]);

            const settings = settingsSnap.val() || {};
            const financialPeriodStartDate = settings.financialPeriodStartDate ? new Date(settings.financialPeriodStartDate) : null;

            if (!accountsSnap.exists()) {
                setBalances([]);
                setLoading(false);
                return;
            }

            const allAccounts: Record<string, Account> = accountsSnap.val();
            const liabilityAccounts = Object.entries(allAccounts)
                .filter(([id, acc]) => acc && acc.type === 'Liabilities' && !acc.isGroup && (id === '7001' || id === '7002' || id.startsWith('6000')))
                .map(([id, acc]) => ({ ...acc, id }));

            const accountBalances: Record<string, number> = {};
            liabilityAccounts.forEach(acc => {
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
                        accountBalances[entry.debit_account] -= (entry.debit_amount || 0);
                    }
                    if (entry.credit_account && accountBalances[entry.credit_account] !== undefined) {
                        accountBalances[entry.credit_account] += (entry.credit_amount || 0);
                    }
                }
            }

            const newBalances: LiabilityBalance[] = [];
            
            liabilityAccounts.forEach(account => {
                if (!account || !account.id) return;
                const balance = accountBalances[account.id] || 0;
                if (account.id === '7001' || account.id === '7002' || (account.id.startsWith('6000') && Math.abs(balance) > 0.01)) {
                    newBalances.push({
                        id: account.id,
                        name: account.name,
                        balance
                    });
                }
            });

            newBalances.sort((a,b) => a.name.localeCompare(b.name));
            setBalances(newBalances);
            setLoading(false);
        } catch (error) {
            console.error('Error calculating liability balances:', error);
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
                <CardTitle>Liability Balances</CardTitle>
                <CardDescription>Unmatched accounts (7001/7002) and client balances.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {loading ? (
                        [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                    ) : balances.length > 0 ? (
                        balances.map(balance => (
                            <div key={balance.id} className="flex justify-between items-center p-2 rounded-md border">
                                <span className="font-medium text-sm truncate">{balance.name}</span>
                                <div className={cn(
                                    "font-mono text-sm whitespace-nowrap",
                                    balance.balance > 0.01 ? 'text-blue-600 font-semibold' : 'text-muted-foreground'
                                )}>
                                    ${balance.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No liabilities.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
