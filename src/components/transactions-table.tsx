
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
import type { Transaction, TransactionFlag } from '@/lib/types';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { Pencil, ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn, normalizeArabic } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionBulkActions } from './transaction-bulk-actions';


type SortableKeys = keyof Transaction;

interface TransactionsTableProps {
    transactions: Transaction[];
    labels: TransactionFlag[];
    loading: boolean;
    onFilteredDataChange: (data: Transaction[]) => void;
}

const ITEMS_PER_PAGE = 50;

export function TransactionsTable({ transactions, labels, loading, onFilteredDataChange }: TransactionsTableProps) {
  // Filter and sort state
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [sortConfig, setSortConfig] = React.useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });
  const [currentPage, setCurrentPage] = React.useState(1);

  // Selection state
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

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
        const normalizedSearch = normalizeArabic(search.toLowerCase().trim());
        const searchTerms = normalizedSearch.split(' ').filter(Boolean);

        filtered = filtered.filter(tx => {
            const clientName = normalizeArabic(tx.clientName?.toLowerCase() || '');
            const clientNameWords = clientName.split(' ');
            const clientNameMatch = searchTerms.every(term => 
                clientNameWords.some(nameWord => nameWord.startsWith(term))
            );

            if (clientNameMatch) {
                return true;
            }
            
            const otherFieldsMatch = (
                (tx.id && tx.id.toLowerCase().includes(normalizedSearch)) ||
                (tx.type && tx.type.toLowerCase().includes(normalizedSearch)) ||
                (tx.amount && tx.amount.toString().includes(normalizedSearch)) ||
                (tx.currency && tx.currency.toLowerCase().includes(normalizedSearch)) ||
                (tx.amount_usd && tx.amount_usd.toString().includes(normalizedSearch)) ||
                (tx.status && tx.status.toLowerCase().includes(normalizedSearch)) ||
                (tx.hash && tx.hash.toLowerCase().includes(normalizedSearch)) ||
                (tx.remittance_number && tx.remittance_number.toLowerCase().includes(normalizedSearch)) ||
                (tx.notes && normalizeArabic(tx.notes.toLowerCase()).includes(normalizedSearch)) ||
                (tx.client_wallet_address && tx.client_wallet_address.toLowerCase().includes(normalizedSearch))
            );
            
            return otherFieldsMatch;
        });
    }

    // Date range filter
    if (dateRange?.from) {
        filtered = filtered.filter(tx => {
            if (!tx.date) return false;
            const txDate = parseISO(tx.date);
            const fromDate = dateRange.from!;
            let toDate: Date;
            if (dateRange.to) {
                toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);
            } else {
                toDate = new Date(8640000000000000);
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
            comparison = parseISO(aVal).getTime() - parseISO(bVal).getTime();
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
    setCurrentPage(1);
    setRowSelection({}); // Reset selection when filters change
  }, [filteredAndSortedTransactions, onFilteredDataChange]);

  const totalPages = Math.ceil(filteredAndSortedTransactions.length / ITEMS_PER_PAGE);

  const paginatedTransactions = React.useMemo(() => {
    return filteredAndSortedTransactions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );
  }, [filteredAndSortedTransactions, currentPage]);

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
  
  const labelsMap = React.useMemo(() => {
    return new Map(labels?.map(label => [label.id, label]));
  }, [labels]);

  const selectedTransactionIds = Object.keys(rowSelection).filter(id => rowSelection[id]);

  const handleSelectAll = (checked: boolean) => {
    const newSelection: Record<string, boolean> = {};
    if (checked) {
      paginatedTransactions.forEach(tx => {
        newSelection[tx.id] = true;
      });
    }
    setRowSelection(newSelection);
  };

  return (
    <div className="space-y-4">
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
                className={cn("w-[260px] justify-start text-left font-normal",!dateRange && "text-muted-foreground")}
                >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? ( dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2}/>
            </PopoverContent>
            </Popover>
            {dateRange && (<Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)}><X className="h-4 w-4" /></Button>)}
        </div>
      </div>

      {selectedTransactionIds.length > 0 && (
          <TransactionBulkActions 
            selectedIds={selectedTransactionIds}
            onActionComplete={() => setRowSelection({})}
          />
      )}
      
      <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-2">
                    <Checkbox
                        checked={Object.keys(rowSelection).length > 0 && paginatedTransactions.length > 0 && Object.keys(rowSelection).length === paginatedTransactions.length}
                        onCheckedChange={(checked) => handleSelectAll(!!checked)}
                        aria-label="Select all"
                    />
                </TableHead>
                <TableHead className="w-8 p-2"></TableHead>
                <SortableHeader sortKey="date">Date</SortableHeader>
                <SortableHeader sortKey="clientName">Client</SortableHeader>
                <SortableHeader sortKey="type">Type</SortableHeader>
                <SortableHeader sortKey="amount">Amount</SortableHeader>
                <SortableHeader sortKey="amount_usd">Amount (USD)</SortableHeader>
                <SortableHeader sortKey="status">Status</SortableHeader>
                <TableHead>Labels</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="h-24 text-center">Loading transactions...</TableCell></TableRow>
              ) : paginatedTransactions.length > 0 ? (
                paginatedTransactions.map(tx => {
                  const firstLabelId = tx.flags?.[0];
                  const firstLabel = firstLabelId ? labelsMap.get(firstLabelId) : null;
                  return (
                    <TableRow key={tx.id} data-state={rowSelection[tx.id] && "selected"}>
                        <TableCell className="px-2">
                            <Checkbox
                                checked={rowSelection[tx.id] || false}
                                onCheckedChange={(checked) => setRowSelection(prev => ({...prev, [tx.id]: !!checked}))}
                                aria-label="Select row"
                            />
                        </TableCell>
                        <TableCell className="p-2">
                            {firstLabel && <div className="h-4 w-4 rounded-full" style={{ backgroundColor: firstLabel.color }} />}
                        </TableCell>
                        <TableCell>
                        {tx.date && !isNaN(parseISO(tx.date).getTime()) ? format(parseISO(tx.date), 'PPP') : 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium">{tx.clientName || tx.clientId}</TableCell>
                        <TableCell>
                        <Badge variant={tx.type === 'Deposit' ? 'outline' : 'secondary'}>{tx.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                        {tx.amount ? new Intl.NumberFormat().format(tx.amount) : ''} {tx.currency}
                        </TableCell>
                        <TableCell className="font-mono">{formatCurrency(tx.amount_usd || 0)}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge></TableCell>
                        <TableCell className="flex flex-wrap gap-1">
                          {tx.flags?.map(labelId => {
                              const label = labelsMap.get(labelId);
                              if (!label) return null;
                              return (
                                <div key={label.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs" style={{ backgroundColor: `${label.color}20` }}>
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                                    {label.name}
                                </div>
                              );
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon">
                            <Link href={`/transactions/${tx.id}/edit`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow><TableCell colSpan={10} className="h-24 text-center">No transactions found for the selected criteria.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between py-4">
            <div className="text-sm text-muted-foreground">
                {selectedTransactionIds.length} of {filteredAndSortedTransactions.length} row(s) selected.
            </div>
            <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || totalPages === 0}>
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || totalPages === 0}>
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0}>
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
    </div>
  );
}
