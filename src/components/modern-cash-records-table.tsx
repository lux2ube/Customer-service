

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
import type { ModernCashRecord, Client, CryptoFee } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, get, limitToLast } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { MoreHorizontal, Calendar as CalendarIcon, ArrowDown, ArrowUp, Pencil, MessageSquare, Trash2, ArrowRight, Bot } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { cancelCashPayment } from '@/lib/actions';
import { QuickAddUsdtOutflow } from './quick-add-usdt-outflow';
import { Checkbox } from './ui/checkbox';


const statuses = ['Pending', 'Matched', 'Used', 'Cancelled'];
const sources = ['Manual', 'SMS'];
const types = ['inflow', 'outflow'];

export function ModernCashRecordsTable({ records: recordsFromProps, selectedIds, onSelectionChange }: { 
    records?: ModernCashRecord[], 
    selectedIds?: string[], 
    onSelectionChange?: (id: string, checked: boolean) => void 
}) {
  const [records, setRecords] = React.useState<ModernCashRecord[]>(recordsFromProps || []);
  const [clients, setClients] = React.useState<Record<string, Client>>({});
  const [loading, setLoading] = React.useState(!recordsFromProps);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sourceFilter, setSourceFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  const [rawSmsToShow, setRawSmsToShow] = React.useState<string | null>(null);
  const [recordToCancel, setRecordToCancel] = React.useState<ModernCashRecord | null>(null);
  const [recordToProcess, setRecordToProcess] = React.useState<ModernCashRecord | null>(null);
  const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);

  const { toast } = useToast();

  React.useEffect(() => {
    if (recordsFromProps) {
      setRecords(recordsFromProps);
      setLoading(false);
      return;
    }
    
    const recordsRef = query(ref(db, 'cash_records'), orderByChild('createdAt'));
    const clientsRef = ref(db, 'clients');

    const unsubRecords = onValue(recordsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: ModernCashRecord[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setRecords(list.reverse()); // Show newest first
      } else {
        setRecords([]);
      }
      setLoading(false);
    });

    const unsubClients = onValue(clientsRef, (snapshot) => {
      if (snapshot.exists()) {
        setClients(snapshot.val());
      }
    });
    
    const feesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));
    const unsubFees = onValue(feesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const lastEntryKey = Object.keys(data)[0];
            setCryptoFees(data[lastEntryKey]);
        }
    });

    return () => { 
        unsubRecords();
        unsubClients();
        unsubFees();
    };
  }, [recordsFromProps]);
  
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
  
  const handleCancelAction = async () => {
    if (!recordToCancel) return;
    const result = await cancelCashPayment(recordToCancel.id);
     if (result?.success) {
        toast({ title: "Record Cancelled", description: "The cash record has been successfully cancelled." });
    } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
    }
    setRecordToCancel(null);
  };
  
  const autoProcessData = React.useMemo(() => {
    if (!recordToProcess || !cryptoFees) return null;
    
    const totalFiatInflowUsd = recordToProcess.amountusd;
    const feePercent = (cryptoFees.buy_fee_percent || 0) / 100;
    const minFee = cryptoFees.minimum_buy_fee || 0;

    let fee = 0;
    let usdtAmount = 0;

    if ((1 + feePercent) > 0) {
        fee = (totalFiatInflowUsd * feePercent) / (1 + feePercent);
        if (totalFiatInflowUsd > 0 && fee < minFee) {
            fee = minFee;
        }
        usdtAmount = totalFiatInflowUsd - fee;
    } else {
        usdtAmount = totalFiatInflowUsd;
    }
    
    return { amount: usdtAmount };

  }, [recordToProcess, cryptoFees]);

  return (
    <>
    {recordToProcess && recordToProcess.clientId && (
        <QuickAddUsdtOutflow
            client={clients[recordToProcess.clientId] ? {id: recordToProcess.clientId, ...clients[recordToProcess.clientId]} : null}
            isOpen={!!recordToProcess}
            setIsOpen={(open) => !open && setRecordToProcess(null)}
            onRecordCreated={() => {}}
            usdtAccounts={[]} // Will be fetched inside dialog
            serviceProviders={[]} // Will be fetched inside dialog
            defaultRecordingAccountId={''} // Fetched inside dialog
            autoProcessData={autoProcessData}
            onDialogClose={() => setRecordToProcess(null)}
        />
    )}
    <div className="space-y-4">
        {!recordsFromProps && (
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
        )}
        
        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                    {onSelectionChange && selectedIds && (
                        <TableHead className="w-10">
                            <Checkbox
                                checked={filteredRecords.length > 0 && filteredRecords.every(r => selectedIds.includes(r.id))}
                                onCheckedChange={(checked) => filteredRecords.forEach(r => onSelectionChange(r.id, !!checked))}
                            />
                        </TableHead>
                    )}
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
                    <TableRow key={record.id} data-state={selectedIds?.includes(record.id) && "selected"}>
                        {onSelectionChange && selectedIds && (
                             <TableCell>
                                <Checkbox
                                    checked={selectedIds.includes(record.id)}
                                    onCheckedChange={(checked) => onSelectionChange(record.id, !!checked)}
                                />
                            </TableCell>
                        )}
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
                                    {(record.type === 'inflow' && (record.status === 'Matched' || record.status === 'Confirmed')) && (
                                        <DropdownMenuItem onClick={() => setRecordToProcess(record)}>
                                            <Bot className="mr-2 h-4 w-4" /> Auto Process
                                        </DropdownMenuItem>
                                    )}
                                    {(record.status === 'Matched' || record.status === 'Confirmed') && record.clientId && (
                                        <DropdownMenuItem asChild>
                                            <Link href={`/transactions/modern?type=${record.type === 'inflow' ? 'Deposit' : 'Withdraw'}&clientId=${record.clientId}&linkedRecordIds=${record.id}`}>
                                                <ArrowRight className="mr-2 h-4 w-4" /> Process
                                            </Link>
                                        </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem asChild>
                                        <Link href={`/modern-cash-records/${record.id}/edit`}>
                                            <Pencil className="mr-2 h-4 w-4" /> Edit
                                        </Link>
                                    </DropdownMenuItem>
                                     {record.source === 'SMS' && record.rawSms && (
                                        <DropdownMenuItem onClick={() => setRawSmsToShow(record.rawSms!)}>
                                            <MessageSquare className="mr-2 h-4 w-4" /> View SMS
                                        </DropdownMenuItem>
                                     )}
                                    {record.status !== 'Cancelled' && (
                                      <DropdownMenuItem onClick={() => setRecordToCancel(record)} className="text-destructive">
                                        <Trash2 className="mr-2 h-4 w-4" /> Cancel
                                      </DropdownMenuItem>
                                    )}
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
    <AlertDialog open={!!rawSmsToShow} onOpenChange={(open) => !open && setRawSmsToShow(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Raw SMS Content</AlertDialogTitle>
                <AlertDialogDescription dir="rtl" className="font-mono bg-muted p-4 rounded-md text-foreground break-words">{rawSmsToShow}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogAction onClick={() => setRawSmsToShow(null)}>Close</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>

     <AlertDialog open={!!recordToCancel} onOpenChange={(open) => !open && setRecordToCancel(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>This will cancel the record. This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancelAction}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
