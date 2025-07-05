
'use client';

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { Transaction } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { Pencil, ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon, X } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

type SortableKeys = keyof Transaction;

interface TransactionsTableProps {
    transactions: Transaction[];
    loading: boolean;
    onFilteredDataChange: (data: Transaction[]) => void;
}

export function TransactionsTable({ transactions, loading, onFilteredDataChange }: TransactionsTableProps) {
  // Filter and sort state
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [sortConfig, setSortConfig] = React.useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  const handleSort = (key: SortableKeys) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedTransactions = React.useMemo(() => {
    let filtered = [...transactions];

    // Search filter
    if (search) {
        const lowercasedSearch = search.toLowerCase();
        filtered = filtered.filter(tx => {
            return (
                tx.id.toLowerCase().includes(lowercasedSearch) ||
                tx.clientName?.toLowerCase().includes(lowercasedSearch) ||
                tx.type.toLowerCase().includes(lowercasedSearch) ||
                tx.amount.toString().includes(lowercasedSearch) ||
                tx.currency.toLowerCase().includes(lowercasedSearch) ||
                tx.amount_usd.toString().includes(lowercasedSearch) ||
                tx.status.toLowerCase().includes(lowercasedSearch) ||
                tx.hash?.toLowerCase().includes(lowercasedSearch) ||
                tx.remittance_number?.toLowerCase().includes(lowercasedSearch) ||
                tx.notes?.toLowerCase().includes(lowercasedSearch) ||
                tx.client_wallet_address?.toLowerCase().includes(lowercasedSearch)
            );
        });
    }

    // Date range filter
    if (dateRange?.from) {
        filtered = filtered.filter(tx => {
            const txDate = new Date(tx.date);
            const fromDate = dateRange.from!;
            // If only 'from' is selected, range is from that day to future.
            let toDate: Date;
            if (dateRange.to) {
                toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999); // end of day to make range inclusive
            } else {
                toDate = new Date(8640000000000000); // far future
            }
            return txDate >= fromDate && txDate <= toDate;
        });
    }

    // Sorting
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Transaction] as any;
        const bVal = b[sortConfig.key as keyof Transaction] as any;

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        let comparison = 0;
        if (sortConfig.key === 'date' || sortConfig.key === 'createdAt') {
            comparison = new Date(aVal).getTime() - new Date(bVal).getTime();
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
        } else {
            comparison = String(aVal).localeCompare(String(bVal));
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [transactions, search, dateRange, sortConfig]);

  React.useEffect(() => {
    onFilteredDataChange(filteredAndSortedTransactions);
  }, [filteredAndSortedTransactions, onFilteredDataChange]);

  const getStatusVariant = (status: Transaction['status']) => {
    switch(status) {
        case 'Confirmed': return 'default';
        case 'Cancelled': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  const renderSortIcon = (columnKey: SortableKeys) => {
    if (sortConfig.key !== columnKey) {
        return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    if (sortConfig.direction === 'asc') {
        return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const SortableHeader = ({ sortKey, children }: { sortKey: SortableKeys; children: React.ReactNode }) => (
    <TableHead>
        <Button variant="ghost" onClick={() => handleSort(sortKey)} className="px-2">
            {children} {renderSortIcon(sortKey)}
        </Button>
    </TableHead>
  );

  return (
    <>
      <div className="flex flex-col md:flex-row items-center gap-4 py-4">
        <Input
          placeholder="Search transactions..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
            <Popover>
            <PopoverTrigger asChild>
                <Button
                id="date"
                variant={"outline"}
                className={cn(
                    "w-[260px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                )}
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
            {dateRange && (
                <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)}>
                    <X className="h-4 w-4" />
                </Button>
            )}
        </div>
      </div>
      <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader sortKey="date">Date</SortableHeader>
                <SortableHeader sortKey="clientName">Client</SortableHeader>
                <SortableHeader sortKey="type">Type</SortableHeader>
                <SortableHeader sortKey="amount">Amount</SortableHeader>
                <SortableHeader sortKey="amount_usd">Amount (USD)</SortableHeader>
                <SortableHeader sortKey="status">Status</SortableHeader>
                <TableHead>Flags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : filteredAndSortedTransactions.length > 0 ? (
                filteredAndSortedTransactions.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                    <TableCell className="font-medium">{tx.clientName || tx.clientId}</TableCell>
                    <TableCell>
                      <Badge variant={tx.type === 'Deposit' ? 'outline' : 'secondary'}>{tx.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">
                      {new Intl.NumberFormat().format(tx.amount)} {tx.currency}
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(tx.amount_usd || 0)}
                    </TableCell>
                    <TableCell>
                        <Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {tx.flags?.map(flag => (
                          <Badge key={flag} variant={flag === 'Blacklisted' ? 'destructive' : 'outline'} className="mr-1">{flag}</Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="icon">
                          <Link href={`/transactions/${tx.id}/edit`}>
                              <Pencil className="h-4 w-4" />
                          </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No transactions found for the selected criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
    </>
  );
}
