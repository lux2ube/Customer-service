
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry, Transaction } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import { ExportButton } from './export-button';

interface ReportRow {
    accountId: string;
    accountName: string;
    debit: number;
    credit: number;
}

interface CalculatedReport {
    rows: ReportRow[];
    totalDebits: number;
    totalCredits: number;
}

export function TrialBalanceReport({ initialAccounts, initialJournalEntries, initialTransactions }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[], initialTransactions: Transaction[] }) {
    const [date, setDate] = React.useState<Date | undefined>(new Date());

    const formatCurrency = (value: number) => {
        if (value === 0) return '';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
    const calculatedData = React.useMemo((): CalculatedReport => {
        const toDate = date ? endOfDay(date) : new Date();

        // 1. Calculate balances for all non-group accounts
        const balances: Record<string, number> = {};
        initialAccounts.forEach(acc => {
            if (!acc.isGroup) balances[acc.id] = 0;
        });

        // from journal entries
        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate <= toDate) {
                if (balances[entry.debit_account] !== undefined) balances[entry.debit_account] += entry.amount_usd;
                if (balances[entry.credit_account] !== undefined) balances[entry.credit_account] -= entry.amount_usd;
            }
        });

        // from transaction principals
        initialTransactions.forEach(tx => {
            if (tx.status !== 'Confirmed') return;
            const txDate = parseISO(tx.date);
            if (txDate <= toDate) {
                if (tx.type === 'Deposit') {
                    if (tx.bankAccountId && balances[tx.bankAccountId] !== undefined) {
                        balances[tx.bankAccountId] += (tx.amount_usd - (tx.fee_usd || 0));
                    }
                    if (tx.cryptoWalletId && balances[tx.cryptoWalletId] !== undefined) {
                        balances[tx.cryptoWalletId] -= (tx.amount_usdt - (tx.expense_usd || 0));
                    }
                }
                else if (tx.type === 'Withdraw') {
                    if (tx.bankAccountId && balances[tx.bankAccountId] !== undefined) {
                        balances[tx.bankAccountId] -= (tx.amount_usd - (tx.expense_usd || 0));
                    }
                    if (tx.cryptoWalletId && balances[tx.cryptoWalletId] !== undefined) {
                        balances[tx.cryptoWalletId] += (tx.amount_usdt - (tx.fee_usd || 0));
                    }
                }
            }
        });
        
        let totalDebits = 0;
        let totalCredits = 0;

        const rows: ReportRow[] = initialAccounts
            .filter(acc => !acc.isGroup && Math.abs(balances[acc.id] || 0) > 0.001) // only show accounts with balances
            .map(acc => {
                const balance = balances[acc.id] || 0;
                let debit = 0;
                let credit = 0;

                // Assets and Expenses are normally debit accounts
                if (acc.type === 'Assets' || acc.type === 'Expenses') {
                    if (balance > 0) debit = balance;
                    else credit = -balance; // show abnormal balance as positive credit
                } 
                // Liabilities, Equity, and Income are normally credit accounts
                else {
                    if (balance < 0) credit = -balance; // show normal balance as positive credit
                    else debit = balance; // show abnormal balance as positive debit
                }
                
                totalDebits += debit;
                totalCredits += credit;

                return {
                    accountId: acc.id,
                    accountName: acc.name,
                    debit,
                    credit,
                };
            })
            .sort((a,b) => a.accountId.localeCompare(b.accountId));


        return { rows, totalDebits, totalCredits };
    }, [date, initialAccounts, initialJournalEntries, initialTransactions]);


    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? `As of ${format(date, "LLL dd, y")}`: <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar initialFocus mode="single" selected={date} onSelect={setDate} />
                    </PopoverContent>
                </Popover>
                <ExportButton 
                    data={calculatedData.rows}
                    filename={`trial-balance-as-of-${date ? format(date, "yyyy-MM-dd") : 'today'}`}
                    headers={{
                        accountId: "Account ID",
                        accountName: "Account Name",
                        debit: "Debit (USD)",
                        credit: "Credit (USD)",
                    }}
                />
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Trial Balance</CardTitle>
                    <p className="text-sm text-muted-foreground">As of {date ? format(date, "MMMM dd, yyyy") : '...'}</p>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedData.rows.map(row => (
                                <TableRow key={row.accountId}>
                                    <TableCell>{row.accountId}</TableCell>
                                    <TableCell>{row.accountName}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(row.debit)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(row.credit)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-card-foreground/10 font-bold">
                                <TableCell colSpan={2}>Totals</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(calculatedData.totalDebits)}</TableCell>
                                <TableCell className={cn(
                                    "text-right font-mono",
                                    Math.abs(calculatedData.totalDebits - calculatedData.totalCredits) > 0.01 && "text-destructive ring-2 ring-destructive rounded-sm p-1"
                                )}>
                                    {formatCurrency(calculatedData.totalCredits)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
