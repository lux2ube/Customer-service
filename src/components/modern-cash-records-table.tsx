
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
import type { ModernCashRecord, Client } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { MoreHorizontal, Calendar as CalendarIcon, ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

const statuses = ['Pending', 'Matched', 'Used', 'Cancelled'];
const sources = ['Manual', 'SMS'];
const types = ['inflow', 'outflow'];

export function ModernCashRecordsTable() {
  const [records, setRecords] = React.useState<ModernCashRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sourceFilter, setSourceFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);

  const { toast } = useToast();

  React.useEffect(() => {
    const recordsRef = query(ref(db, 'modern_cash_records'), orderByChild('createdAt'));
    const unsubscribe = onValue(recordsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: ModernCashRecord[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setRecords(list.reverse()); // Show newest first
      } else {
        setRecords([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const filteredRecords = React.useMemo(() => {
    return records.filter(r => {
        if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (typeFilter !== 'all' && r.type !== typeFilter) return false;
        
        if (dateRange?.from) {
            const txDate = new Date(r.date);
            const fromDate = dateRange.from!;
            let toDate: Date;
            if (dateRange.to) {
                toDate = new Date(dateRange.to);
                toDate.setHours(23, 59, 59, 999);
            } else {
                toDate = new Date(8640000000000000);
            }
            if (txDate < fromDate || txDate > toDate) return false;
        }

        if (search) {
            const lowercasedSearch = search.toLowerCase();
            return (
                (r.clientName && r.clientName.toLowerCase().includes(lowercasedSearch)) ||
                (r.senderName && r.senderName.toLowerCase().includes(lowercasedSearch)) ||
                (r.accountName && r.accountName.toLowerCase().includes(lowercasedSearch)) ||
                r.amount.toString().includes(lowercasedSearch)
            );
        }

        return true;
    });
  }, [records, search, statusFilter, sourceFilter, typeFilter, dateRange]);
  
  const getStatusVariant = (status: ModernCashRecord['status']) => {
        switch(status) {
            case 'Pending': return 'secondary';
            case 'Matched': return 'default';
            case 'Used': return 'outline';
            case 'Cancelled': return 'destructive';
            default: return 'secondary';
        }
    }

  return (
    <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-2 py-4 flex-wrap">
            <Input 
                placeholder="Search records..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full md:w-[150px]"><SelectValue placeholder="Filter by type..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {types.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by source..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by status..." /></SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
            </Select>
            <Popover>
            <PopoverTrigger asChild>
                <Button id="date" variant={"outline"} className={cn("w-full md:w-[260px] justify-start text-left font-normal", !dateRange && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : format(dateRange.from, "LLL dd, y")) : (<span>Pick a date range</span>)}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
            </PopoverContent>
            </Popover>
        </div>
        
        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Sender/Recipient</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center">Loading records...</TableCell></TableRow>
                ) : filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                    <TableRow key={record.id}>
                        <TableCell className="font-mono text-xs">{record.id}</TableCell>
                        <TableCell>{record.date && !isNaN(new Date(record.date).getTime()) ? format(new Date(record.date), 'Pp') : 'N/A'}</TableCell>
                        <TableCell>
                            <span className={cn('flex items-center gap-1', record.type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                                {record.type === 'inflow' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                                {record.type}
                            </span>
                        </TableCell>
                        <TableCell className="font-medium">{record.clientName || "Unassigned"}</TableCell>
                        <TableCell>{record.senderName || record.recipientName}</TableCell>
                        <TableCell>{record.accountName}</TableCell>
                        <TableCell className="text-right font-mono">{new Intl.NumberFormat().format(record.amount)} {record.currency}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(record.status)} className="capitalize">{record.status}</Badge></TableCell>
                        <TableCell className="text-right">
                           <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                        <Link href={`/modern-cash-records/${record.id}/edit`}>
                                            <Pencil className="mr-2 h-4 w-4" /> Edit
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem>Cancel</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))
                ) : (
                    <TableRow><TableCell colSpan={9} className="h-24 text-center">No records found for the selected criteria.</TableCell></TableRow>
                )}
            </TableBody>
            </Table>
        </div>
    </div>
  );
}
