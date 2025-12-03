'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import type { JournalEntry, Account } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';

interface TransactionEntry {
    journalId: string;
    date: string;
    description: string;
    otherAccount: string;
    otherAccountName: string;
    amount: number;
    isIncrease: boolean;
    balanceBefore: number;
    balanceAfter: number;
}

export function AccountTransactionsReport({ initialAccounts, initialJournalEntries }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[] }) {
    const [selectedAccountId, setSelectedAccountId] = React.useState<string>('');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
    const [periodStartDate, setPeriodStartDate] = React.useState<Date | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [openAccountSelector, setOpenAccountSelector] = React.useState(false);

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
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
    };

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString('en-GB', { 
                day: '2-digit', 
                month: 'short', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateStr;
        }
    };

    const selectedAccount = React.useMemo(() => {
        return initialAccounts.find(a => a.id === selectedAccountId);
    }, [selectedAccountId, initialAccounts]);

    const nonGroupAccounts = React.useMemo(() => {
        return initialAccounts
            .filter(a => !a.isGroup)
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [initialAccounts]);

    const transactions = React.useMemo(() => {
        if (!selectedAccountId) return [];

        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : periodStart;
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

        const accType = selectedAccount?.type;
        const isAssetOrExpense = accType === 'Assets' || accType === 'Expenses';

        const entries: TransactionEntry[] = [];

        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate < fromDate || entryDate > toDate) return;

            const isDebit = entry.debit_account === selectedAccountId;
            const isCredit = entry.credit_account === selectedAccountId;

            if (isDebit || isCredit) {
                const isIncrease = isAssetOrExpense ? isDebit : isCredit;
                
                entries.push({
                    journalId: entry.id || '',
                    date: entry.date,
                    description: entry.description || '',
                    otherAccount: isDebit ? entry.credit_account : entry.debit_account,
                    otherAccountName: isDebit 
                        ? (entry.credit_account_name || entry.credit_account)
                        : (entry.debit_account_name || entry.debit_account),
                    amount: entry.amount_usd,
                    isIncrease,
                    balanceBefore: 0,
                    balanceAfter: 0,
                });
            }
        });

        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = 0;
        for (const entry of entries) {
            entry.balanceBefore = runningBalance;
            if (entry.isIncrease) {
                entry.balanceAfter = runningBalance + entry.amount;
            } else {
                entry.balanceAfter = runningBalance - entry.amount;
            }
            runningBalance = entry.balanceAfter;
        }

        return entries;
    }, [selectedAccountId, dateRange, periodStartDate, initialJournalEntries, selectedAccount]);

    const finalBalance = transactions.length > 0 ? transactions[transactions.length - 1].balanceAfter : 0;

    const exportableData = React.useMemo(() => {
        return transactions.map((t, index) => ({
            index: index + 1,
            date: formatDate(t.date),
            description: t.description,
            otherAccount: t.otherAccountName,
            type: t.isIncrease ? 'INCREASE' : 'DECREASE',
            amount: t.amount.toFixed(2),
            balanceBefore: t.balanceBefore.toFixed(2),
            balanceAfter: t.balanceAfter.toFixed(2),
        }));
    }, [transactions]);

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Account Transactions</CardTitle>
                            <CardDescription>View all transactions for any account with running balance</CardDescription>
                        </div>
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
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-4 items-end">
                        <div className="space-y-2 flex-1 min-w-[300px]">
                            <label className="text-sm font-medium">Select Account</label>
                            <Popover open={openAccountSelector} onOpenChange={setOpenAccountSelector}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openAccountSelector}
                                        className="w-full justify-between font-normal h-11"
                                    >
                                        {selectedAccount ? (
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm">{selectedAccount.id}</span>
                                                <span>{selectedAccount.name}</span>
                                            </div>
                                        ) : (
                                            "Select an account..."
                                        )}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder="Search accounts..." />
                                        <CommandList>
                                            <CommandEmpty>No account found.</CommandEmpty>
                                            <CommandGroup>
                                                {nonGroupAccounts.map(account => (
                                                    <CommandItem
                                                        key={account.id}
                                                        value={`${account.id} ${account.name}`}
                                                        onSelect={() => {
                                                            setSelectedAccountId(account.id);
                                                            setOpenAccountSelector(false);
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                selectedAccountId === account.id ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-sm text-muted-foreground">{account.id}</span>
                                                            <span>{account.name}</span>
                                                            <Badge variant="outline" className="ml-auto text-xs">{account.type}</Badge>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
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
                        {selectedAccount && transactions.length > 0 && (
                            <ExportButton 
                                data={exportableData}
                                filename={`account-transactions-${selectedAccount.id}-${format(new Date(), 'yyyy-MM-dd')}`}
                                headers={{
                                    index: "#",
                                    date: "Date",
                                    description: "Description",
                                    otherAccount: "Counter Account",
                                    type: "Type",
                                    amount: "Amount (USD)",
                                    balanceBefore: "Balance Before",
                                    balanceAfter: "Balance After",
                                }}
                            />
                        )}
                    </div>

                    {selectedAccount && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-muted rounded-lg">
                                <div className="text-sm text-muted-foreground">Selected Account</div>
                                <div className="text-lg font-semibold">{selectedAccount.name}</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground font-mono">{selectedAccount.id}</span>
                                    <Badge variant="outline" className="text-xs">{selectedAccount.type}</Badge>
                                </div>
                            </div>
                            <div className="p-4 bg-primary/10 rounded-lg">
                                <div className="text-sm text-muted-foreground">Current Balance</div>
                                <div className={cn(
                                    "text-2xl font-bold",
                                    finalBalance >= 0 ? "text-primary" : "text-destructive"
                                )}>
                                    {formatCurrency(finalBalance)}
                                </div>
                                <div className="text-xs text-muted-foreground">{transactions.length} transactions</div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {!selectedAccount && (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground text-center py-8">
                            Select an account to view its transactions
                        </p>
                    </CardContent>
                </Card>
            )}

            {selectedAccount && transactions.length === 0 && (
                <Card>
                    <CardContent className="pt-6">
                        <p className="text-sm text-muted-foreground text-center py-8">
                            No transactions found for {selectedAccount.name} in the selected period
                        </p>
                    </CardContent>
                </Card>
            )}

            {selectedAccount && transactions.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Transaction History</CardTitle>
                        <CardDescription>All transactions for {selectedAccount.name}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="w-[50px]">#</TableHead>
                                        <TableHead className="w-[140px]">Date</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead className="w-[100px] text-center">Type</TableHead>
                                        <TableHead className="w-[110px] text-right">Amount</TableHead>
                                        <TableHead className="w-[110px] text-right">Balance Before</TableHead>
                                        <TableHead className="w-[110px] text-right">Balance After</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((t, index) => (
                                        <TableRow key={t.journalId || index} className="hover:bg-muted/30">
                                            <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                                            <TableCell className="text-xs font-mono whitespace-nowrap">
                                                {formatDate(t.date)}
                                            </TableCell>
                                            <TableCell className="text-sm max-w-[300px]">
                                                <div className="truncate" title={t.description}>
                                                    {t.description}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-0.5">
                                                    {t.isIncrease ? 'From' : 'To'}: {t.otherAccountName}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {t.isIncrease ? (
                                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                                        <ArrowDownLeft className="h-3 w-3" />
                                                        INCREASE
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                                        <ArrowUpRight className="h-3 w-3" />
                                                        DECREASE
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm font-medium">
                                                {formatCurrency(t.amount)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                                {formatCurrency(t.balanceBefore)}
                                            </TableCell>
                                            <TableCell className={cn(
                                                "text-right font-mono text-sm font-semibold",
                                                t.balanceAfter >= t.balanceBefore ? "text-primary" : "text-destructive"
                                            )}>
                                                {formatCurrency(t.balanceAfter)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
