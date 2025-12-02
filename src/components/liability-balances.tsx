
'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
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

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const journalRef = ref(db, 'journal_entries');

        const unsubAccounts = onValue(accountsRef, (accSnapshot) => {
            if (!accSnapshot.exists()) {
                setLoading(false);
                return;
            }
            const allAccounts: Record<string, Account> = accSnapshot.val();
            const liabilityAccounts = Object.values(allAccounts).filter(acc => acc.type === 'Liabilities' && !acc.isGroup && (acc.id === '7001' || acc.id === '7002' || acc.id.startsWith('6000')));

            const unsubJournal = onValue(journalRef, (journalSnapshot) => {
                const accountBalances: Record<string, number> = {};
                liabilityAccounts.forEach(acc => accountBalances[acc.id] = 0);

                if (journalSnapshot.exists()) {
                    const allEntries: Record<string, JournalEntry> = journalSnapshot.val();
                    for (const key in allEntries) {
                        const entry = allEntries[key];
                        // For liability accounts: DEBIT = decrease, CREDIT = increase
                        if (accountBalances[entry.debit_account] !== undefined) {
                            accountBalances[entry.debit_account] -= entry.debit_amount;
                        }
                        if (accountBalances[entry.credit_account] !== undefined) {
                            accountBalances[entry.credit_account] += entry.credit_amount;
                        }
                    }
                }

                const newBalances: LiabilityBalance[] = [];
                
                liabilityAccounts.forEach(account => {
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
            });

            return () => unsubJournal();
        });

        return () => unsubAccounts();
    }, []);

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
