
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, endOfDay, parseISO, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow, TableFooter } from '@/components/ui/table';
import { Separator } from './ui/separator';
import { ExportButton } from './export-button';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

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
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
    const [periodStartDate, setPeriodStartDate] = React.useState<Date | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsRef = ref(db, 'settings/financialPeriodStartDate');
                const snapshot = await get(settingsRef);
                if (snapshot.exists()) {
                    const periodStart = new Date(snapshot.val());
                    setPeriodStartDate(periodStart);
                    setDateRange({
                        from: periodStart,
                        to: new Date(),
                    });
                } else {
                    setDateRange({
                        from: new Date(new Date().getFullYear(), 0, 1),
                        to: new Date(),
                    });
                }
            } catch (error) {
                console.error('Error loading settings:', error);
                setDateRange({
                    from: new Date(new Date().getFullYear(), 0, 1),
                    to: new Date(),
                });
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const formatCurrency = (value: number) => {
        const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
        return value < 0 ? `(${formatted})` : formatted;
    }
    
    const calculatedData = React.useMemo((): CalculatedReport => {
        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : periodStart;
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
                if (revenueAccountIds.has(entry.credit_account)) {
                    revenueTotals[entry.credit_account] = (revenueTotals[entry.credit_account] || 0) + entry.amount_usd;
                }
                if (revenueAccountIds.has(entry.debit_account)) {
                    revenueTotals[entry.debit_account] = (revenueTotals[entry.debit_account] || 0) - entry.amount_usd;
                }

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
            .filter(row => Math.abs(row.amount) > 0.01)
            .sort((a, b) => b.amount - a.amount);

        const expenseRows: ReportRow[] = expenseAccounts
            .map(acc => ({
                accountId: acc.id,
                accountName: acc.name,
                amount: expenseTotals[acc.id] || 0,
            }))
            .filter(row => Math.abs(row.amount) > 0.01)
            .sort((a, b) => b.amount - a.amount);

        const totalRevenue = revenueRows.reduce((sum, row) => sum + row.amount, 0);
        const totalExpenses = expenseRows.reduce((sum, row) => sum + row.amount, 0);
        const netIncome = totalRevenue - totalExpenses;

        return { revenueRows, totalRevenue, expenseRows, totalExpenses, netIncome };

    }, [dateRange, periodStartDate, initialAccounts, initialJournalEntries]);
    
    const exportableData = React.useMemo(() => {
        const { revenueRows, expenseRows, totalRevenue, totalExpenses, netIncome } = calculatedData;
        return [
            ...revenueRows.map(row => ({ category: 'Revenue', ...row, amount: row.amount.toFixed(2) })),
            ...expenseRows.map(row => ({ category: 'Expense', ...row, amount: row.amount.toFixed(2) })),
            { category: '---', accountId: 'TOTAL_REVENUE', accountName: 'Total Revenue', amount: totalRevenue.toFixed(2) },
            { category: '---', accountId: 'TOTAL_EXPENSES', accountName: 'Total Expenses', amount: totalExpenses.toFixed(2) },
            { category: '---', accountId: 'NET_INCOME', accountName: 'Net Income', amount: netIncome.toFixed(2) },
        ];
    }, [calculatedData]);

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
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
                <ExportButton 
                    data={exportableData}
                    filename={`income-statement-${dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : 'start'}-to-${dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : 'end'}`}
                    headers={{
                        category: "Category",
                        accountId: "Account ID",
                        accountName: "Account Name",
                        amount: "Amount (USD)",
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
                                <p>Data from the current financial period starting {format(periodStartDate, "MMMM dd, yyyy")}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Income Statement</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        {dateRange?.from && dateRange?.to ? (
                            `For the period ${format(dateRange.from, "MMMM dd, yyyy")} to ${format(dateRange.to, "MMMM dd, yyyy")}`
                        ) : (
                            'Select a date range'
                        )}
                    </p>
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
                                            <TableCell className="text-right font-mono text-green-600">{formatCurrency(row.amount)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No revenue recorded in this period.</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                    <TableRow className="bg-muted/50 font-bold">
                                        <TableCell>Total Revenue</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{formatCurrency(calculatedData.totalRevenue)}</TableCell>
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
                                            <TableCell className="text-right font-mono text-red-600">{formatCurrency(row.amount)}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground h-16">No expenses recorded in this period.</TableCell></TableRow>
                                    )}
                                </TableBody>
                                <TableFooter>
                                     <TableRow className="bg-muted/50 font-bold">
                                        <TableCell>Total Expenses</TableCell>
                                        <TableCell className="text-right font-mono text-red-600">{formatCurrency(calculatedData.totalExpenses)}</TableCell>
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
                            calculatedData.netIncome >= 0 ? "text-green-600" : "text-destructive"
                        )}>
                            {formatCurrency(calculatedData.netIncome)}
                        </p>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
