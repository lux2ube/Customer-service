
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfYear, endOfDay, parseISO, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Separator } from './ui/separator';

interface ReportRow {
    accountName: string;
    accountId: string;
    amount: number;
}

interface CalculatedReport {
    revenueRows: ReportRow[];
    totalRevenue: number;
    expenseRows: ReportRow[];
    totalExpenses: number;
    netIncome: number;
}

export function IncomeStatementReport({ initialAccounts, initialJournalEntries }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[] }) {
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>({
        from: startOfYear(new Date()),
        to: new Date(),
    });

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
    const calculatedData = React.useMemo((): CalculatedReport => {
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : new Date(0);
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const revenueAccounts = initialAccounts.filter(acc => acc.type === 'Income');
        const expenseAccounts = initialAccounts.filter(acc => acc.type === 'Expenses');
        
        const revenueAccountIds = new Set(revenueAccounts.map(acc => acc.id));
        const expenseAccountIds = new Set(expenseAccounts.map(acc => acc.id));

        const revenueTotals: Record<string, number> = {};
        const expenseTotals: Record<string, number> = {};

        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate >= fromDate && entryDate <= toDate) {
                // Revenue accounts are increased by credits
                if (revenueAccountIds.has(entry.credit_account)) {
                    revenueTotals[entry.credit_account] = (revenueTotals[entry.credit_account] || 0) + entry.amount_usd;
                }
                if (revenueAccountIds.has(entry.debit_account)) {
                     revenueTotals[entry.debit_account] = (revenueTotals[entry.debit_account] || 0) - entry.amount_usd;
                }

                // Expense accounts are increased by debits
                if (expenseAccountIds.has(entry.debit_account)) {
                    expenseTotals[entry.debit_account] = (expenseTotals[entry.debit_account] || 0) + entry.amount_usd;
                }
                if (expenseAccountIds.has(entry.credit_account)) {
                    expenseTotals[entry.credit_account] = (expenseTotals[entry.credit_account] || 0) - entry.amount_usd;
                }
            }
        });
        
        const revenueRows: ReportRow[] = revenueAccounts
            .map(acc => ({
                accountId: acc.id,
                accountName: acc.name,
                amount: revenueTotals[acc.id] || 0,
            }))
            .filter(row => row.amount !== 0)
            .sort((a,b) => a.accountId.localeCompare(b.accountId));

        const expenseRows: ReportRow[] = expenseAccounts
            .map(acc => ({
                accountId: acc.id,
                accountName: acc.name,
                amount: expenseTotals[acc.id] || 0,
            }))
            .filter(row => row.amount !== 0)
            .sort((a,b) => a.accountId.localeCompare(b.accountId));

        const totalRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
        const totalExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
        const netIncome = totalRevenue - totalExpenses;

        return { revenueRows, totalRevenue, expenseRows, totalExpenses, netIncome };

    }, [dateRange, initialAccounts, initialJournalEntries]);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            id="date"
                            variant={"outline"}
                            className={cn("w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange?.from ? (
                                dateRange.to ? (
                                    <>
                                        {format(dateRange.from, "LLL dd, y")} -{" "}
                                        {format(dateRange.to, "LLL dd, y")}
                                    </>
                                ) : (
                                    format(dateRange.from, "LLL dd, y")
                                )
                            ) : (
                                <span>Pick a date range</span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={2}
                        />
                    </PopoverContent>
                </Popover>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Income Statement</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg font-semibold mb-2">Revenue</h3>
                            <Table>
                                <TableBody>
                                    {calculatedData.revenueRows.length > 0 ? calculatedData.revenueRows.map(row => (
                                        <TableRow key={row.accountId}>
                                            <TableCell className="pl-8">{row.accountName}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No revenue recorded in this period.</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="bg-muted/50 font-bold">
                                        <TableCell>Total Revenue</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(calculatedData.totalRevenue)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                        
                        <Separator />

                        <div>
                            <h3 className="text-lg font-semibold mb-2">Expenses</h3>
                            <Table>
                                <TableBody>
                                    {calculatedData.expenseRows.length > 0 ? calculatedData.expenseRows.map(row => (
                                        <TableRow key={row.accountId}>
                                            <TableCell className="pl-8">{row.accountName}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(row.amount)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No expenses recorded in this period.</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                     <TableRow className="bg-muted/50 font-bold">
                                        <TableCell>Total Expenses</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(calculatedData.totalExpenses)}</TableCell>
                                    </TableRow>
                                </TableFooter>
                            </Table>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="bg-card-foreground/5 p-4 mt-6">
                    <div className="flex justify-between w-full items-center">
                        <h3 className="text-lg font-bold">Net Income</h3>
                        <p className={cn(
                            "text-lg font-bold font-mono",
                            calculatedData.netIncome >= 0 ? "text-primary" : "text-destructive"
                        )}>
                            {formatCurrency(calculatedData.netIncome)}
                        </p>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
