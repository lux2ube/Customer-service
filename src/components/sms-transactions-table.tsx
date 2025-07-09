
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SmsTransaction, Account } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { MoreHorizontal, Calendar as CalendarIcon, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { updateSmsTransactionStatus } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

const statuses: SmsTransaction['status'][] = ['pending', 'matched', 'used', 'rejected'];
const types: ('deposit' | 'withdraw')[] = ['deposit', 'withdraw'];

export function SmsTransactionsTable() {
    const [transactions, setTransactions] = React.useState<SmsTransaction[]>([]);
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [statusFilter, setStatusFilter] = React.useState('all');
    const [typeFilter, setTypeFilter] = React.useState('all');
    const [accountFilter, setAccountFilter] = React.useState('all');
    const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
    
    const [rawSmsToShow, setRawSmsToShow] = React.useState<string | null>(null);
    const [linkTxId, setLinkTxId] = React.useState<string | null>(null);

    const { toast } = useToast();

    React.useEffect(() => {
        const transactionsRef = ref(db, 'sms_transactions/');
        const accountsRef = ref(db, 'accounts');

        const unsubscribeTransactions = onValue(transactionsRef, (snapshot) => {
            const data = snapshot.val();
            const list: SmsTransaction[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            list.sort((a, b) => new Date(b.parsed_at).getTime() - new Date(a.parsed_at).getTime());
            setTransactions(list);
            setLoading(false);
        });
        
        const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            const list: Account[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setAccounts(list.filter(acc => !acc.isGroup));
        });

        return () => {
            unsubscribeTransactions();
            unsubscribeAccounts();
        };
    }, []);

    const filteredTransactions = React.useMemo(() => {
        return transactions.filter(tx => {
            if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
            if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
            if (accountFilter !== 'all' && tx.account_id !== accountFilter) return false;
            if (dateRange?.from) {
                const txDate = new Date(tx.parsed_at);
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
            return true;
        });
    }, [transactions, statusFilter, typeFilter, accountFilter, dateRange]);
    
    const getStatusVariant = (status: SmsTransaction['status']) => {
        switch(status) {
            case 'pending': return 'secondary';
            case 'matched': return 'default';
            case 'used': return 'outline';
            case 'rejected': return 'destructive';
            default: return 'secondary';
        }
    }

    const handleStatusUpdate = async (id: string, status: SmsTransaction['status']) => {
        const result = await updateSmsTransactionStatus(id, status);
        if (result?.success) {
            toast({ title: "Status Updated", description: `Transaction marked as ${status}.`});
        } else {
            toast({ variant: "destructive", title: "Error", description: result.message });
        }
    };

    return (
    <div dir="rtl">
      <div className="flex flex-col md:flex-row items-center gap-2 py-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by status..." /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
        </Select>
         <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by type..." /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
            </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full md:w-[220px]"><SelectValue placeholder="Filter by account..." /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
            </SelectContent>
        </Select>
        <div className="flex gap-2">
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
            {dateRange && (<Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)}><X className="h-4 w-4" /></Button>)}
        </div>
      </div>
      <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Parsed At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading transactions...</TableCell></TableRow>
              ) : filteredTransactions.length > 0 ? (
                filteredTransactions.map(tx => (
                  <TableRow key={tx.id}>
                    <TableCell className="font-medium">{tx.client_name}</TableCell>
                    <TableCell>{tx.account_name || tx.account_id}</TableCell>
                    <TableCell><Badge variant={!tx.type ? 'destructive' : tx.type === 'deposit' ? 'outline' : 'secondary'} className="capitalize">{tx.type || 'Unknown'}</Badge></TableCell>
                    <TableCell className="font-mono">{tx.amount ? new Intl.NumberFormat().format(tx.amount) : ''} {tx.currency}</TableCell>
                    <TableCell><Badge variant={getStatusVariant(tx.status)} className="capitalize">{tx.status}</Badge></TableCell>
                    <TableCell>{tx.parsed_at && !isNaN(new Date(tx.parsed_at).getTime()) ? format(new Date(tx.parsed_at), 'Pp') : 'N/A'}</TableCell>
                    <TableCell className="text-right">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleStatusUpdate(tx.id, 'used')}>Mark as Used</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusUpdate(tx.id, 'matched')}>Mark as Matched</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusUpdate(tx.id, 'rejected')}>Mark as Rejected</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRawSmsToShow(tx.raw_sms)}>View Raw SMS</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setLinkTxId(tx.id)}>Link to Transaction</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={7} className="h-24 text-center">No SMS transactions found for the selected criteria.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
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

        <AlertDialog open={!!linkTxId} onOpenChange={(open) => !open && setLinkTxId(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Link to Crypto Transaction</AlertDialogTitle>
                    <AlertDialogDescription>This functionality is coming soon. It will allow you to manually associate this SMS with a formal transaction record.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                     <AlertDialogAction onClick={() => setLinkTxId(null)}>Close</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </div>
  );
}
