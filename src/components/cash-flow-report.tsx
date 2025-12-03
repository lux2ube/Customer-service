'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow, TableFooter } from '@/components/ui/table';
import { Separator } from './ui/separator';
import { ExportButton } from './export-button';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface CashFlowRow {
    description: string;
    amount: number;
    isSubtotal?: boolean;
}

interface CashFlowSection {
    title: string;
    rows: CashFlowRow[];
    total: number;
}

export function CashFlowReport({ initialAccounts, initialJournalEntries }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[] }) {
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

    const cashFlowData = React.useMemo(() => {
        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : periodStart;
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const cashAccounts = new Set(
            initialAccounts
                .filter(a => a.type === 'Assets' && (
                    a.name.toLowerCase().includes('cash') ||
                    a.name.toLowerCase().includes('bank') ||
                    a.id.startsWith('1001') ||
                    a.id.startsWith('1002')
                ))
                .map(a => a.id)
        );

        const incomeAccounts = new Set(initialAccounts.filter(a => a.type === 'Income').map(a => a.id));
        const expenseAccounts = new Set(initialAccounts.filter(a => a.type === 'Expenses').map(a => a.id));
        const clientAccounts = new Set(initialAccounts.filter(a => a.parentId === '6000').map(a => a.id));
        const assetAccounts = new Set(initialAccounts.filter(a => a.type === 'Assets' && !cashAccounts.has(a.id)).map(a => a.id));

        const cashInflows: Record<string, number> = {};
        const cashOutflows: Record<string, number> = {};
        let clientReceipts = 0;
        let clientPayments = 0;
        let revenueReceived = 0;
        let expensesPaid = 0;
        let assetPurchases = 0;
        let assetSales = 0;
        let otherInflows = 0;
        let otherOutflows = 0;

        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate < fromDate || entryDate > toDate) return;

            const amount = entry.amount_usd;
            const debitAcc = entry.debit_account;
            const creditAcc = entry.credit_account;

            if (cashAccounts.has(debitAcc)) {
                if (clientAccounts.has(creditAcc)) {
                    clientReceipts += amount;
                } else if (incomeAccounts.has(creditAcc)) {
                    revenueReceived += amount;
                } else if (assetAccounts.has(creditAcc)) {
                    assetSales += amount;
                } else {
                    otherInflows += amount;
                }
            }

            if (cashAccounts.has(creditAcc)) {
                if (clientAccounts.has(debitAcc)) {
                    clientPayments += amount;
                } else if (expenseAccounts.has(debitAcc)) {
                    expensesPaid += amount;
                } else if (assetAccounts.has(debitAcc)) {
                    assetPurchases += amount;
                } else {
                    otherOutflows += amount;
                }
            }
        });

        const operatingSection: CashFlowSection = {
            title: 'Operating Activities',
            rows: [
                { description: 'Revenue received', amount: revenueReceived },
                { description: 'Receipts from clients', amount: clientReceipts },
                { description: 'Payments to clients', amount: -clientPayments },
                { description: 'Operating expenses paid', amount: -expensesPaid },
            ].filter(r => Math.abs(r.amount) > 0.01),
            total: revenueReceived + clientReceipts - clientPayments - expensesPaid,
        };

        const investingSection: CashFlowSection = {
            title: 'Investing Activities',
            rows: [
                { description: 'Asset purchases', amount: -assetPurchases },
                { description: 'Asset sales', amount: assetSales },
            ].filter(r => Math.abs(r.amount) > 0.01),
            total: assetSales - assetPurchases,
        };

        const otherSection: CashFlowSection = {
            title: 'Other Activities',
            rows: [
                { description: 'Other cash inflows', amount: otherInflows },
                { description: 'Other cash outflows', amount: -otherOutflows },
            ].filter(r => Math.abs(r.amount) > 0.01),
            total: otherInflows - otherOutflows,
        };

        const netChange = operatingSection.total + investingSection.total + otherSection.total;

        return {
            sections: [operatingSection, investingSection, otherSection].filter(s => s.rows.length > 0),
            netChange,
            totalInflows: revenueReceived + clientReceipts + assetSales + otherInflows,
            totalOutflows: clientPayments + expensesPaid + assetPurchases + otherOutflows,
        };
    }, [dateRange, periodStartDate, initialAccounts, initialJournalEntries]);

    const exportableData = React.useMemo(() => {
        const rows: any[] = [];
        cashFlowData.sections.forEach(section => {
            rows.push({ category: section.title, description: '', amount: '' });
            section.rows.forEach(row => {
                rows.push({
                    category: '',
                    description: row.description,
                    amount: row.amount.toFixed(2),
                });
            });
            rows.push({
                category: '',
                description: `Net ${section.title}`,
                amount: section.total.toFixed(2),
            });
            rows.push({ category: '', description: '', amount: '' });
        });
        rows.push({
            category: 'TOTAL',
            description: 'Net Cash Change',
            amount: cashFlowData.netChange.toFixed(2),
        });
        return rows;
    }, [cashFlowData]);

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button
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
                    filename={`cash-flow-statement-${dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : 'start'}-to-${dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : 'end'}`}
                    headers={{
                        category: "Category",
                        description: "Description",
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
                                <p>Data from the current financial period</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}
            </div>

            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-green-600" />
                            <span className="text-sm text-muted-foreground">Total Inflows</span>
                        </div>
                        <p className="text-2xl font-bold text-green-600 mt-2">
                            {formatCurrency(cashFlowData.totalInflows)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <TrendingDown className="h-5 w-5 text-red-600" />
                            <span className="text-sm text-muted-foreground">Total Outflows</span>
                        </div>
                        <p className="text-2xl font-bold text-red-600 mt-2">
                            {formatCurrency(cashFlowData.totalOutflows)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2">
                            <Wallet className="h-5 w-5 text-primary" />
                            <span className="text-sm text-muted-foreground">Net Change</span>
                        </div>
                        <p className={cn(
                            "text-2xl font-bold mt-2",
                            cashFlowData.netChange >= 0 ? "text-primary" : "text-destructive"
                        )}>
                            {cashFlowData.netChange >= 0 ? '+' : ''}{formatCurrency(cashFlowData.netChange)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Cash Flow Statement</CardTitle>
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
                        {cashFlowData.sections.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No cash flow activity found for this period.
                            </div>
                        ) : (
                            cashFlowData.sections.map((section, index) => (
                                <div key={section.title}>
                                    {index > 0 && <Separator className="mb-8" />}
                                    <h3 className="text-lg font-semibold mb-4">{section.title}</h3>
                                    <Table>
                                        <TableBody>
                                            {section.rows.map((row, i) => (
                                                <TableRow key={i}>
                                                    <TableCell className="pl-8">{row.description}</TableCell>
                                                    <TableCell className={cn(
                                                        "text-right font-mono",
                                                        row.amount >= 0 ? "text-green-600" : "text-red-600"
                                                    )}>
                                                        {formatCurrency(row.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                        <TableFooter>
                                            <TableRow className="bg-muted/50 font-bold">
                                                <TableCell>Net {section.title}</TableCell>
                                                <TableCell className={cn(
                                                    "text-right font-mono",
                                                    section.total >= 0 ? "text-green-600" : "text-red-600"
                                                )}>
                                                    {formatCurrency(section.total)}
                                                </TableCell>
                                            </TableRow>
                                        </TableFooter>
                                    </Table>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
                <CardFooter className="bg-card-foreground/5 p-4 mt-6">
                    <div className="flex justify-between w-full items-center">
                        <h3 className="text-lg font-bold">Net Cash Change</h3>
                        <p className={cn(
                            "text-lg font-bold font-mono",
                            cashFlowData.netChange >= 0 ? "text-green-600" : "text-destructive"
                        )}>
                            {cashFlowData.netChange >= 0 ? '+' : ''}{formatCurrency(cashFlowData.netChange)}
                        </p>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
