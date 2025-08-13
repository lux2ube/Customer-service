
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import type { JournalEntry, Client, Account } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { format, startOfDay, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { ExportButton } from './export-button';

interface ClientSummary {
    clientId: string;
    clientName: string;
    totalDebits: number;
    totalCredits: number;
    netBalance: number;
}

export function ClientBalanceSummaryReport({ initialJournalEntries, initialClients, initialAccounts }: { initialJournalEntries: JournalEntry[], initialClients: Client[], initialAccounts: Account[] }) {
    const [search, setSearch] = React.useState('');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
    const clientSubAccounts = React.useMemo(() => {
        const clientParent = initialAccounts.find(a => a.id === '6000');
        if (!clientParent) return new Map<string, string>(); // Map from accountId to clientName
        
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
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : new Date(0);
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const filteredJournalEntries = initialJournalEntries.filter(entry => {
            if (!dateRange?.from) return true;
            const entryDate = parseISO(entry.date);
            return entryDate >= fromDate && entryDate <= toDate;
        });
        
        const summaryMap: Record<string, { clientName: string; debits: number; credits: number }> = {};
        
        initialClients.forEach(client => {
            const accountId = clientIdToAccountIdMap.get(client.id);
            if (accountId) {
                summaryMap[client.id] = {
                    clientName: client.name,
                    debits: 0,
                    credits: 0,
                };
            }
        });

        filteredJournalEntries.forEach(entry => {
            const client = initialClients.find(c => `6000${c.id}` === entry.debit_account || `6000${c.id}` === entry.credit_account);
            if (client) {
                const summary = summaryMap[client.id];
                if (!summary) return;

                if (`6000${client.id}` === entry.debit_account) {
                    summary.debits += entry.amount_usd;
                }
                 if (`6000${client.id}` === entry.credit_account) {
                    summary.credits += entry.amount_usd;
                }
            }
        });
        
        const summaries: ClientSummary[] = Object.keys(summaryMap).map(clientId => {
            const data = summaryMap[clientId];
            return {
                clientId,
                clientName: data.clientName,
                totalDebits: data.debits,
                totalCredits: data.credits,
                netBalance: data.credits - data.debits, // For liability accounts, credits are positive
            };
        });

        return summaries.sort((a, b) => b.netBalance - a.netBalance);

    }, [initialJournalEntries, dateRange, initialClients, clientIdToAccountIdMap]);

    const filteredSummaries = React.useMemo(() => {
         if (!search) return clientSummaries;
         const lowercasedSearch = search.toLowerCase();
         return clientSummaries.filter(summary => 
            summary.clientName.toLowerCase().includes(lowercasedSearch)
         );
    }, [clientSummaries, search]);

    const totals = React.useMemo(() => {
        return filteredSummaries.reduce((acc, summary) => {
            acc.debits += summary.totalDebits;
            acc.credits += summary.totalCredits;
            acc.net += summary.netBalance;
            return acc;
        }, { debits: 0, credits: 0, net: 0 });
    }, [filteredSummaries]);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Client Balance Summary</CardTitle>
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
                            data={filteredSummaries.map(s => ({
                                ...s,
                                totalDebits: s.totalDebits.toFixed(2),
                                totalCredits: s.totalCredits.toFixed(2),
                                netBalance: s.netBalance.toFixed(2),
                            }))}
                            filename={`client-balance-summary-${dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : 'start'}-to-${dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : 'end'}`}
                            headers={{
                                clientId: "Client ID",
                                clientName: "Client Name",
                                totalCredits: "Total Credits (USD)",
                                totalDebits: "Total Debits (USD)",
                                netBalance: "Net Balance (USD)",
                            }}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Client Name</TableHead>
                                <TableHead className="text-right">Total Credits (USD)</TableHead>
                                <TableHead className="text-right">Total Debits (USD)</TableHead>
                                <TableHead className="text-right">Net Balance (USD)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredSummaries.length > 0 ? (
                                filteredSummaries.map(summary => (
                                    <TableRow key={summary.clientId}>
                                        <TableCell className="font-medium">{summary.clientName}</TableCell>
                                        <TableCell className="text-right font-mono text-green-600">{formatCurrency(summary.totalCredits)}</TableCell>
                                        <TableCell className="text-right font-mono text-red-600">{formatCurrency(summary.totalDebits)}</TableCell>
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
                                <TableCell className="text-right font-mono text-green-600">{formatCurrency(totals.credits)}</TableCell>
                                <TableCell className="text-right font-mono text-red-600">{formatCurrency(totals.debits)}</TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(totals.net)}</TableCell>
                            </TableRow>
                        </TableFooter>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
