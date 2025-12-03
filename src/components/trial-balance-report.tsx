
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, endOfDay, parseISO, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import { ExportButton } from './export-button';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Badge } from './ui/badge';

interface ReportRow {
    accountId: string;
    accountName: string;
    accountType: string;
    increases: number;
    decreases: number;
    netBalance: number;
}

interface CalculatedReport {
    rows: ReportRow[];
    totalIncreases: number;
    totalDecreases: number;
    isBalanced: boolean;
}

export function TrialBalanceReport({ initialAccounts, initialJournalEntries }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[] }) {
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    const [periodStartDate, setPeriodStartDate] = React.useState<Date | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsRef = ref(db, 'settings/financialPeriodStartDate');
                const snapshot = await get(settingsRef);
                if (snapshot.exists()) {
                    setPeriodStartDate(new Date(snapshot.val()));
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const formatCurrency = (value: number) => {
        if (Math.abs(value) < 0.01) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
    const calculatedData = React.useMemo((): CalculatedReport => {
        const toDate = date ? endOfDay(date) : new Date();
        const fromDate = periodStartDate ? startOfDay(periodStartDate) : new Date(0);

        const balances: Record<string, { increases: number; decreases: number }> = {};
        initialAccounts.forEach(acc => {
            if (!acc.isGroup) {
                balances[acc.id] = { increases: 0, decreases: 0 };
            }
        });

        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate >= fromDate && entryDate <= toDate) {
                const debitAcc = entry.debit_account;
                const creditAcc = entry.credit_account;
                const amount = entry.amount_usd;

                if (balances[debitAcc]) {
                    const accType = initialAccounts.find(a => a.id === debitAcc)?.type;
                    if (accType === 'Assets' || accType === 'Expenses') {
                        balances[debitAcc].increases += amount;
                    } else {
                        balances[debitAcc].decreases += amount;
                    }
                }
                if (balances[creditAcc]) {
                    const accType = initialAccounts.find(a => a.id === creditAcc)?.type;
                    if (accType === 'Assets' || accType === 'Expenses') {
                        balances[creditAcc].decreases += amount;
                    } else {
                        balances[creditAcc].increases += amount;
                    }
                }
            }
        });
        
        let totalIncreases = 0;
        let totalDecreases = 0;

        const rows: ReportRow[] = initialAccounts
            .filter(acc => {
                if (acc.isGroup) return false;
                const bal = balances[acc.id];
                return bal && (Math.abs(bal.increases) > 0.001 || Math.abs(bal.decreases) > 0.001);
            })
            .map(acc => {
                const bal = balances[acc.id];
                const increases = bal?.increases || 0;
                const decreases = bal?.decreases || 0;
                const netBalance = increases - decreases;
                
                totalIncreases += increases;
                totalDecreases += decreases;

                return {
                    accountId: acc.id,
                    accountName: acc.name,
                    accountType: acc.type,
                    increases,
                    decreases,
                    netBalance,
                };
            })
            .sort((a, b) => a.accountId.localeCompare(b.accountId));

        const isBalanced = Math.abs(totalIncreases - totalDecreases) < 0.01;

        return { rows, totalIncreases, totalDecreases, isBalanced };
    }, [date, periodStartDate, initialAccounts, initialJournalEntries]);

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
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
                    data={calculatedData.rows.map(row => ({
                        ...row,
                        increases: row.increases.toFixed(2),
                        decreases: row.decreases.toFixed(2),
                        netBalance: row.netBalance.toFixed(2),
                    }))}
                    filename={`trial-balance-as-of-${date ? format(date, "yyyy-MM-dd") : 'today'}`}
                    headers={{
                        accountId: "Account ID",
                        accountName: "Account Name",
                        accountType: "Type",
                        increases: "Increases (USD)",
                        decreases: "Decreases (USD)",
                        netBalance: "Net Balance (USD)",
                    }}
                />
                {periodStartDate && (
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge variant="outline" className="gap-1">
                                    <Info className="h-3 w-3" />
                                    Period: {format(periodStartDate, "MMM dd, yyyy")}
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Only showing entries from the current financial period</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Trial Balance</CardTitle>
                            <p className="text-sm text-muted-foreground">As of {date ? format(date, "MMMM dd, yyyy") : '...'}</p>
                        </div>
                        {calculatedData.isBalanced ? (
                            <Badge variant="default" className="bg-green-600">Balanced</Badge>
                        ) : (
                            <Badge variant="destructive">Out of Balance</Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Account Code</TableHead>
                                <TableHead>Account Name</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Increases</TableHead>
                                <TableHead className="text-right">Decreases</TableHead>
                                <TableHead className="text-right">Net Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {calculatedData.rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No transactions found for this period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                calculatedData.rows.map(row => (
                                    <TableRow key={row.accountId}>
                                        <TableCell className="font-mono text-sm">{row.accountId}</TableCell>
                                        <TableCell>{row.accountName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">{row.accountType}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{formatCurrency(row.increases)}</TableCell>
                                        <TableCell className="text-right font-mono text-red-600">{formatCurrency(row.decreases)}</TableCell>
                                        <TableCell className={cn(
                                            "text-right font-mono font-semibold",
                                            row.netBalance >= 0 ? "text-primary" : "text-destructive"
                                        )}>
                                            {formatCurrency(row.netBalance)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-card-foreground/10 font-bold">
                                <TableCell colSpan={3}>Totals</TableCell>
                                <TableCell className="text-right font-mono text-green-600">{formatCurrency(calculatedData.totalIncreases)}</TableCell>
                                <TableCell className="text-right font-mono text-red-600">{formatCurrency(calculatedData.totalDecreases)}</TableCell>
                                <TableCell className={cn(
                                    "text-right font-mono",
                                    !calculatedData.isBalanced && "text-destructive ring-2 ring-destructive rounded-sm p-1"
                                )}>
                                    {formatCurrency(calculatedData.totalIncreases - calculatedData.totalDecreases)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
