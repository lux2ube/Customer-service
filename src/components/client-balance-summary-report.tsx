'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import type { Transaction } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface ClientSummary {
    clientId: string;
    clientName: string;
    totalDeposits: number;
    totalWithdrawals: number;
    netBalance: number;
}

export function ClientBalanceSummaryReport({ initialTransactions }: { initialTransactions: Transaction[] }) {
    const [search, setSearch] = React.useState('');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }

    const clientSummaries = React.useMemo(() => {
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : new Date(0);
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const filteredTransactions = initialTransactions.filter(tx => {
            if (!dateRange?.from) return true; // No date filter applied
            const txDate = parseISO(tx.date);
            return txDate >= fromDate && txDate <= toDate;
        });
        
        const summaryMap: Record<string, { clientName: string; deposits: number; withdrawals: number }> = {};

        filteredTransactions.forEach(tx => {
            if (tx.status !== 'Confirmed' || !tx.clientId) return;

            if (!summaryMap[tx.clientId]) {
                summaryMap[tx.clientId] = {
                    clientName: tx.clientName || tx.clientId,
                    deposits: 0,
                    withdrawals: 0,
                };
            }

            if (tx.type === 'Deposit') {
                summaryMap[tx.clientId].deposits += tx.amount_usd;
            } else if (tx.type === 'Withdraw') {
                summaryMap[tx.clientId].withdrawals += tx.amount_usd;
            }
        });
        
        const summaries: ClientSummary[] = Object.keys(summaryMap).map(clientId => {
            const data = summaryMap[clientId];
            return {
                clientId,
                clientName: data.clientName,
                totalDeposits: data.deposits,
                totalWithdrawals: data.withdrawals,
                netBalance: data.deposits - data.withdrawals,
            };
        });

        return summaries.sort((a, b) => b.netBalance - a.netBalance);

    }, [initialTransactions, dateRange]);

    const filteredSummaries = React.useMemo(() => {
         if (!search) return clientSummaries;
         const lowercasedSearch = search.toLowerCase();
         return clientSummaries.filter(summary => 
            summary.clientName.toLowerCase().includes(lowercasedSearch)
         );
    }, [clientSummaries, search]);

    const totals = React.useMemo(() => {
        // This now correctly calculates totals based on the currently displayed (filtered) list.
        return filteredSummaries.reduce((acc, summary) => {
            acc.deposits += summary.totalDeposits;
            acc.withdrawals += summary.totalWithdrawals;
            acc.net += summary.netBalance;
            return acc;
        }, { deposits: 0, withdrawals: 0, net: 0 });
    }, [filteredSummaries]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Client Balance Summary</CardTitle>
                    <div className="flex flex-col md:flex-row gap-4 mt-4">
                        <Input 
                            placeholder="Search by client name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-sm"
                        />
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    id="date"
                                    variant={"outline"}
                                    className={cn("w-full md:w-[300px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
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
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Client Name</TableHead>
                                <TableHead className="text-right">Total Deposits (USD)</TableHead>
                                <TableHead className="text-right">Total Withdrawals (USD)</TableHead>
                                <TableHead className="text-right">Net Balance (USD)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSummaries.length > 0 ? (
                                filteredSummaries.map(summary => (
                                    <TableRow key={summary.clientId}>
                                        <TableCell className="font-medium">{summary.clientName}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(summary.totalDeposits)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(summary.totalWithdrawals)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(summary.netBalance)}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No client data found for the selected period.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-card-foreground/10 font-bold">
                                <TableCell>Grand Totals</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(totals.deposits)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(totals.withdrawals)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(totals.net)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
