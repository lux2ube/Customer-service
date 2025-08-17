

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
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, Calendar as CalendarIcon, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Pencil, FileText, CheckCircle, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn, normalizeArabic } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { TransactionBulkActions } from './transaction-bulk-actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { ExportButton } from './export-button';
import Link from 'next/link';
import { useActionState } from 'react';
import { confirmTransaction, type ConfirmState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type SortableKeys = keyof Transaction;

const ITEMS_PER_PAGE = 50;

const statuses: Transaction['status'][] = ['Pending', 'Confirmed', 'Cancelled'];
const types: Transaction['type'][] = ['Deposit', 'Withdraw', 'Transfer'];

export function TransactionsTable() {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [sortConfig, setSortConfig] = React.useState<{ key: SortableKeys; direction: 'asc' | 'desc' }>({ key: 'id', direction: 'desc' });
  const [currentPage, setCurrentPage] = React.useState(1);
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const transactionsRef = ref(db, 'modern_transactions/');
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
        const data = snapshot.val();
        setTransactions(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSort = (key: SortableKeys) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };
  
  const filteredAndSortedTransactions = React.useMemo(() => {
    let filtered = [...transactions];

    if (search) {
        const normalizedSearch = normalizeArabic(search.toLowerCase().trim());
        const searchTerms = normalizedSearch.split(' ').filter(Boolean);

        filtered = filtered.filter(tx => {
            const clientName = normalizeArabic(tx.clientName?.toLowerCase() || '');
            const clientNameMatch = searchTerms.every(term => clientName.includes(term));
            
            if (clientNameMatch) return true;
            
            return (
                (tx.id && tx.id.toLowerCase().includes(normalizedSearch)) ||
                (tx.type && tx.type.toLowerCase().includes(normalizedSearch)) ||
                (tx.summary?.total_inflow_usd && tx.summary.total_inflow_usd.toString().includes(normalizedSearch)) ||
                (tx.status && tx.status.toLowerCase().includes(normalizedSearch))
            );
        });
    }

    if (typeFilter !== 'all') {
        filtered = filtered.filter(tx => tx.type === typeFilter);
    }
    if (statusFilter !== 'all') {
        filtered = filtered.filter(tx => tx.status === statusFilter);
    }

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

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal: any = a[sortConfig.key as keyof Transaction];
        let bVal: any = b[sortConfig.key as keyof Transaction];

        // Handle nested summary object
        if (sortConfig.key === 'amount_usd') {
            aVal = a.summary?.total_inflow_usd;
            bVal = b.summary?.total_inflow_usd;
        } else if (sortConfig.key === 'outflow_usd') {
            aVal = a.summary?.total_outflow_usd;
            bVal = b.summary?.total_outflow_usd;
        }

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        
        let comparison = 0;
        if (sortConfig.key === 'id') {
            const numA = parseInt(String(aVal).substring(1));
            const numB = parseInt(String(bVal).substring(1));
            comparison = numA - numB;
        } else if (sortConfig.key === 'date' || sortConfig.key === 'createdAt') {
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
  }, [transactions, search, dateRange, sortConfig, typeFilter, statusFilter]);

  React.useEffect(() => {
    setCurrentPage(1);
    setRowSelection({});
  }, [filteredAndSortedTransactions]);

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

  const SortableHeader = ({ sortKey, children, className }: { sortKey: SortableKeys; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}>
        <Button variant="ghost" onClick={() => handleSort(sortKey)} className="px-2">
            {children} {renderSortIcon(sortKey)}
        </Button>
    </TableHead>
  );
  
  const selectedTransactionIds = Object.keys(rowSelection).filter(id => rowSelection[id]);

  const handleSelectAll = (checked: boolean) => {
    const newSelection: Record<string, boolean> = {};
    if (checked) {
      paginatedTransactions.forEach(tx => {
        if(tx.id) newSelection[tx.id] = true;
      });
    }
    setRowSelection(newSelection);
  };
  
  const clearFilters = () => {
    setSearch('');
    setDateRange(undefined);
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const exportableData = filteredAndSortedTransactions.map(tx => {
    const inflow = tx.summary ? tx.summary.total_inflow_usd : (tx.amount_usd || 0);
    const outflow = tx.summary ? tx.summary.total_outflow_usd : (tx.outflow_usd || 0);
    const fee = tx.summary ? tx.summary.fee_usd : (tx.fee_usd || 0);
    const difference = tx.summary ? tx.summary.net_difference_usd : (inflow - (outflow + fee));
    
    return {
        ID: tx.id,
        Date: tx.date ? format(parseISO(tx.date), 'yyyy-MM-dd HH:mm') : 'N/A',
        Client: tx.clientName,
        Type: tx.type,
        Inflow_USD: inflow.toFixed(2),
        Outflow_USD: outflow.toFixed(2),
        Fee_USD: fee.toFixed(2),
        Difference_USD: difference.toFixed(2),
        Status: tx.status,
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row items-center gap-4 py-4">
        <Input
          placeholder="Search transactions..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2 flex-wrap">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Filter by type..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Filter by status..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
            </Select>
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
            <Button variant="ghost" onClick={clearFilters}><X className="mr-2 h-4 w-4" />Clear Filters</Button>
            <ExportButton data={exportableData} filename="transactions" />
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
                <SortableHeader sortKey="id">ID</SortableHeader>
                <SortableHeader sortKey="date">Date</SortableHeader>
                <SortableHeader sortKey="clientName">Client</SortableHeader>
                <SortableHeader sortKey="type">Type</SortableHeader>
                <SortableHeader sortKey="amount_usd" className="text-right">Inflow (USD)</SortableHeader>
                <SortableHeader sortKey="outflow_usd" className="text-right">Outflow (USD)</SortableHeader>
                <SortableHeader sortKey="status">Status</SortableHeader>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="h-24 text-center">Loading transactions...</TableCell></TableRow>
              ) : paginatedTransactions.length > 0 ? (
                paginatedTransactions.map(tx => (
                    <TableRow key={tx.id} data-state={rowSelection[tx.id] && "selected"} className="cursor-pointer">
                        <TableCell className="px-2">
                            <Checkbox
                                checked={rowSelection[tx.id] || false}
                                onCheckedChange={(checked) => setRowSelection(prev => ({...prev, [tx.id]: !!checked}))}
                                onClick={(e) => e.stopPropagation()}
                                aria-label="Select row"
                            />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{tx.id}</TableCell>
                        <TableCell>
                            {tx.date && !isNaN(parseISO(tx.date).getTime()) ? format(parseISO(tx.date), 'PPp') : 'N/A'}
                        </TableCell>
                        <TableCell className="font-medium">{tx.clientName || tx.clientId}</TableCell>
                        <TableCell>
                            <Badge variant={tx.type === 'Deposit' ? 'outline' : 'secondary'}>{tx.type}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-right">{formatCurrency(tx.summary ? tx.summary.total_inflow_usd : (tx.amount_usd || 0))}</TableCell>
                        <TableCell className="font-mono text-right">{formatCurrency(tx.summary ? tx.summary.total_outflow_usd : (tx.outflow_usd || 0))}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge></TableCell>
                        <TableCell className="text-right">
                           <Button variant="ghost" size="icon" asChild>
                               <Link href={`/transactions/${tx.id}/invoice`} target="_blank">
                                   <FileText className="h-4 w-4" />
                               </Link>
                           </Button>
                        </TableCell>
                    </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={9} className="h-24 text-center">No transactions found for the selected criteria.</TableCell></TableRow>
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
