'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead, TableFooter } from '@/components/ui/table';
import type { JournalEntry, Account } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, Info, ChevronDown, ChevronRight } from 'lucide-react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

interface AccountBalance {
    accountId: string;
    accountName: string;
    accountType: string;
    increases: number;
    decreases: number;
    netChange: number;
    endingBalance: number;
}

export function AccountBalancesReport({ initialAccounts, initialJournalEntries }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[] }) {
    const [search, setSearch] = React.useState('');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
    const [periodStartDate, setPeriodStartDate] = React.useState<Date | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [typeFilter, setTypeFilter] = React.useState<string>('all');
    const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

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
        if (Math.abs(value) < 0.01) return '-';
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
    }

    const accountBalances = React.useMemo(() => {
        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);
        const fromDate = dateRange?.from ? startOfDay(dateRange.from) : periodStart;
        const toDate = dateRange?.to ? endOfDay(dateRange.to) : new Date();

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

        const results: AccountBalance[] = initialAccounts
            .filter(acc => {
                if (acc.isGroup) return false;
                const bal = balances[acc.id];
                return bal && (Math.abs(bal.increases) > 0.01 || Math.abs(bal.decreases) > 0.01);
            })
            .map(acc => {
                const bal = balances[acc.id];
                const increases = bal?.increases || 0;
                const decreases = bal?.decreases || 0;
                const netChange = increases - decreases;
                
                return {
                    accountId: acc.id,
                    accountName: acc.name,
                    accountType: acc.type,
                    increases,
                    decreases,
                    netChange,
                    endingBalance: netChange,
                };
            });

        return results.sort((a, b) => a.accountId.localeCompare(b.accountId));
    }, [dateRange, periodStartDate, initialAccounts, initialJournalEntries]);

    const filteredBalances = React.useMemo(() => {
        let filtered = accountBalances;
        
        if (typeFilter !== 'all') {
            filtered = filtered.filter(b => b.accountType === typeFilter);
        }
        
        if (search) {
            const lowercased = search.toLowerCase();
            filtered = filtered.filter(b => 
                b.accountName.toLowerCase().includes(lowercased) ||
                b.accountId.toLowerCase().includes(lowercased)
            );
        }
        
        return filtered;
    }, [accountBalances, typeFilter, search]);

    const totals = React.useMemo(() => {
        return filteredBalances.reduce((acc, bal) => {
            acc.increases += bal.increases;
            acc.decreases += bal.decreases;
            acc.netChange += bal.netChange;
            return acc;
        }, { increases: 0, decreases: 0, netChange: 0 });
    }, [filteredBalances]);

    const groupedByType = React.useMemo(() => {
        const groups: Record<string, AccountBalance[]> = {};
        filteredBalances.forEach(bal => {
            if (!groups[bal.accountType]) {
                groups[bal.accountType] = [];
            }
            groups[bal.accountType].push(bal);
        });
        return groups;
    }, [filteredBalances]);

    const toggleGroup = (type: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(type)) {
            newExpanded.delete(type);
        } else {
            newExpanded.add(type);
        }
        setExpandedGroups(newExpanded);
    };

    if (loading) {
        return <div className="p-4">Loading report settings...</div>;
    }

    const typeOrder = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Account Balances</CardTitle>
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
                            placeholder="Search by account name or code..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-sm"
                        />
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filter by type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Assets">Assets</SelectItem>
                                <SelectItem value="Liabilities">Liabilities</SelectItem>
                                <SelectItem value="Equity">Equity</SelectItem>
                                <SelectItem value="Income">Income</SelectItem>
                                <SelectItem value="Expenses">Expenses</SelectItem>
                            </SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
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
                            data={filteredBalances.map(b => ({
                                ...b,
                                increases: b.increases.toFixed(2),
                                decreases: b.decreases.toFixed(2),
                                netChange: b.netChange.toFixed(2),
                                endingBalance: b.endingBalance.toFixed(2),
                            }))}
                            filename={`account-balances-${format(new Date(), 'yyyy-MM-dd')}`}
                            headers={{
                                accountId: "Account Code",
                                accountName: "Account Name",
                                accountType: "Type",
                                increases: "Increases (USD)",
                                decreases: "Decreases (USD)",
                                netChange: "Net Change (USD)",
                                endingBalance: "Balance (USD)",
                            }}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {typeOrder.filter(type => groupedByType[type]).map(type => (
                            <Collapsible 
                                key={type} 
                                open={expandedGroups.has(type) || expandedGroups.size === 0}
                                onOpenChange={() => toggleGroup(type)}
                            >
                                <CollapsibleTrigger asChild>
                                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted">
                                        <div className="flex items-center gap-2">
                                            {expandedGroups.has(type) || expandedGroups.size === 0 ? (
                                                <ChevronDown className="h-4 w-4" />
                                            ) : (
                                                <ChevronRight className="h-4 w-4" />
                                            )}
                                            <span className="font-semibold">{type}</span>
                                            <Badge variant="secondary">{groupedByType[type].length} accounts</Badge>
                                        </div>
                                        <span className="font-mono font-semibold">
                                            {formatCurrency(groupedByType[type].reduce((sum, b) => sum + b.endingBalance, 0))}
                                        </span>
                                    </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Account Code</TableHead>
                                                <TableHead>Account Name</TableHead>
                                                <TableHead className="text-right">Increases</TableHead>
                                                <TableHead className="text-right">Decreases</TableHead>
                                                <TableHead className="text-right">Net Change</TableHead>
                                                <TableHead className="text-right">Balance</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {groupedByType[type].map(bal => (
                                                <TableRow key={bal.accountId}>
                                                    <TableCell className="font-mono text-sm">{bal.accountId}</TableCell>
                                                    <TableCell>{bal.accountName}</TableCell>
                                                    <TableCell className="text-right font-mono text-green-600">
                                                        {formatCurrency(bal.increases)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-red-600">
                                                        {formatCurrency(bal.decreases)}
                                                    </TableCell>
                                                    <TableCell className={cn(
                                                        "text-right font-mono",
                                                        bal.netChange > 0 ? "text-green-600" : bal.netChange < 0 ? "text-red-600" : ""
                                                    )}>
                                                        {bal.netChange > 0 ? '+' : ''}{formatCurrency(bal.netChange)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-semibold">
                                                        {formatCurrency(bal.endingBalance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CollapsibleContent>
                            </Collapsible>
                        ))}
                        
                        {filteredBalances.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No account activity found for the selected period and filters.
                            </div>
                        )}
                    </div>
                    
                    {filteredBalances.length > 0 && (
                        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                            <div className="grid grid-cols-4 gap-4 text-center">
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Accounts</div>
                                    <div className="text-xl font-bold">{filteredBalances.length}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Increases</div>
                                    <div className="text-xl font-bold text-green-600">{formatCurrency(totals.increases)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Total Decreases</div>
                                    <div className="text-xl font-bold text-red-600">{formatCurrency(totals.decreases)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-muted-foreground">Net Change</div>
                                    <div className={cn(
                                        "text-xl font-bold",
                                        totals.netChange >= 0 ? "text-primary" : "text-destructive"
                                    )}>
                                        {totals.netChange >= 0 ? '+' : ''}{formatCurrency(totals.netChange)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
