
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import type { JournalEntry, Client, Account } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info, TrendingUp, TrendingDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ExportButton } from './export-button';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface ClientSummary {
    clientId: string;
    clientName: string;
    totalReceived: number;
    totalPaid: number;
    balance: number;
}

export function ClientBalanceSummaryReport({ initialJournalEntries, initialClients, initialAccounts }: { initialJournalEntries: JournalEntry[], initialClients: Client[], initialAccounts: Account[] }) {
    const [search, setSearch] = React.useState('');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
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
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
    }
    
    const clientSubAccounts = React.useMemo(() => {
        return new Map(
            initialAccounts
                .filter(a => a.parentId === '6000')
                .map(acc => [acc.id, acc.name])
        );
    }, [initialAccounts]);
    
    const clientIdToAccountIdMap = React.useMemo(() => {
        const map = new Map<string, string>();
        initialClients.forEach(client => {
            const accountId = `6000${client.id}`;
            if (clientSubAccounts.has(accountId)) {
                map.set(client.id, accountId);
            }
        });
        return map;
    }, [initialClients, clientSubAccounts]);


    const clientSummaries = React.useMemo(() => {
        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : periodStart;
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const filteredJournalEntries = initialJournalEntries.filter(entry => {
            const entryDate = parseISO(entry.date);
            return entryDate >= fromDate && entryDate <= toDate;
        });
        
        const summaryMap: Record<string, { clientName: string; received: number; paid: number }> = {};
        
        initialClients.forEach(client => {
            const accountId = clientIdToAccountIdMap.get(client.id);
            if (accountId) {
                summaryMap[client.id] = {
                    clientName: client.name,
                    received: 0,
                    paid: 0,
                };
            }
        });

        filteredJournalEntries.forEach(entry => {
            const client = initialClients.find(c => `6000${c.id}` === entry.debit_account || `6000${c.id}` === entry.credit_account);
            if (client) {
                const summary = summaryMap[client.id];
                if (!summary) return;

                if (`6000${client.id}` === entry.debit_account) {
                    summary.received += entry.amount_usd;
                }
                if (`6000${client.id}` === entry.credit_account) {
                    summary.paid += entry.amount_usd;
                }
            }
        });
        
        const summaries: ClientSummary[] = Object.keys(summaryMap).map(clientId => {
            const data = summaryMap[clientId];
            return {
                clientId,
                clientName: data.clientName,
                totalReceived: data.received,
                totalPaid: data.paid,
                balance: data.received - data.paid,
            };
        });

        return summaries
            .filter(s => Math.abs(s.totalReceived) > 0.01 || Math.abs(s.totalPaid) > 0.01)
            .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

    }, [initialJournalEntries, dateRange, periodStartDate, initialClients, clientIdToAccountIdMap]);

    const filteredSummaries = React.useMemo(() => {
        if (!search) return clientSummaries;
        const lowercasedSearch = search.toLowerCase();
        return clientSummaries.filter(summary => 
            summary.clientName.toLowerCase().includes(lowercasedSearch)
        );
    }, [clientSummaries, search]);

    const totals = React.useMemo(() => {
        return filteredSummaries.reduce((acc, summary) => {
            acc.received += summary.totalReceived;
            acc.paid += summary.totalPaid;
            acc.balance += summary.balance;
            return acc;
        }, { received: 0, paid: 0, balance: 0 });
    }, [filteredSummaries]);

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Client Balance Summary</CardTitle>
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
                                        <p>Showing data from the current financial period</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 mt-4 items-center">
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
                                        <span>Filter by date range</span>
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
                            data={filteredSummaries.map(s => ({
                                clientId: s.clientId,
                                clientName: s.clientName,
                                totalReceived: s.totalReceived.toFixed(2),
                                totalPaid: s.totalPaid.toFixed(2),
                                balance: s.balance.toFixed(2),
                            }))}
                            filename={`client-balance-summary-${dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : 'start'}-to-${dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : 'end'}`}
                            headers={{
                                clientId: "Client ID",
                                clientName: "Client Name",
                                totalReceived: "Received from Client (USD)",
                                totalPaid: "Paid to Client (USD)",
                                balance: "Balance (USD)",
                            }}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Client Name</TableHead>
                                <TableHead className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <TrendingDown className="h-4 w-4 text-green-600" />
                                        Received from Client
                                    </div>
                                </TableHead>
                                <TableHead className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                        <TrendingUp className="h-4 w-4 text-red-600" />
                                        Paid to Client
                                    </div>
                                </TableHead>
                                <TableHead className="text-right">Balance (We Owe)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSummaries.length > 0 ? (
                                filteredSummaries.map(summary => (
                                    <TableRow key={summary.clientId}>
                                        <TableCell className="font-medium">{summary.clientName}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">
                                            {formatCurrency(summary.totalReceived)}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-red-600">
                                            {formatCurrency(summary.totalPaid)}
                                        </TableCell>
                                        <TableCell className={cn(
                                            "text-right font-mono font-semibold",
                                            summary.balance > 0 ? "text-primary" : summary.balance < 0 ? "text-destructive" : ""
                                        )}>
                                            {summary.balance > 0 ? '+' : ''}{formatCurrency(summary.balance)}
                                            {summary.balance !== 0 && (
                                                <span className="text-xs text-muted-foreground ml-1">
                                                    {summary.balance > 0 ? '(owed)' : '(overpaid)'}
                                                </span>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No client activity found for the selected period.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        <TableFooter>
                            <TableRow className="bg-card-foreground/10 font-bold">
                                <TableCell>Grand Totals ({filteredSummaries.length} clients)</TableCell>
                                <TableCell className="text-right font-mono text-green-600">{formatCurrency(totals.received)}</TableCell>
                                <TableCell className="text-right font-mono text-red-600">{formatCurrency(totals.paid)}</TableCell>
                                <TableCell className={cn(
                                    "text-right font-mono",
                                    totals.balance > 0 ? "text-primary" : totals.balance < 0 ? "text-destructive" : ""
                                )}>
                                    {totals.balance > 0 ? '+' : ''}{formatCurrency(totals.balance)}
                                </TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
