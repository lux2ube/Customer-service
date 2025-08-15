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
import type { Client, CashRecord } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { MessageSquareText, MoreHorizontal, Calendar as CalendarIcon, X, Check, ChevronsUpDown, Pencil, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { updateSmsTransactionStatus, linkSmsToClient, cancelCashPayment } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { CashReceiptBulkActions } from './cash-receipt-bulk-actions';
import Link from 'next/link';

const statuses: (CashRecord['status'])[] = ['Pending', 'Matched', 'Used', 'Cancelled'];
const sources = ['Manual', 'SMS'];

// A unified type for the table
export type UnifiedPayment = CashRecord;

function ManualLinkDialog({ sms, clients, onLink, onOpenChange }: { sms: UnifiedPayment | null, clients: Client[], onLink: (clientId: string) => void, onOpenChange: (open: boolean) => void }) {
    if (!sms) return null;
    return (
        <Dialog open={!!sms} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Manually Link SMS to Client</DialogTitle>
                </DialogHeader>
                 <ClientSelector clients={clients} onClientSelect={onLink} />
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="secondary" type="button">Cancel</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ClientSelector({ clients, onClientSelect }: { clients: Client[], onClientSelect: (clientId: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value ? clients.find((client) => client.id === value)?.name : "Select client..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search clients..." />
          <CommandList>
            <CommandEmpty>No client found.</CommandEmpty>
            <CommandGroup>
                {clients.map((client) => (
                <CommandItem
                    key={client.id}
                    value={`${client.id} ${client.name} ${(Array.isArray(client.phone) ? client.phone.join(' ') : client.phone || '')}`}
                    onSelect={() => {
                        setValue(client.id)
                        setOpen(false)
                        onClientSelect(client.id)
                    }}
                >
                    <Check className={cn("mr-2 h-4 w-4", value === client.id ? "opacity-100" : "opacity-0")} />
                    <div className="flex justify-between w-full">
                        <span>{client.name}</span>
                        <span className="text-muted-foreground">{Array.isArray(client.phone) ? client.phone[0] : client.phone}</span>
                    </div>
                </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function CashPaymentsTable({ initialPayments, initialClients }: { initialPayments: UnifiedPayment[], initialClients: Client[] }) {
  const [payments, setPayments] = React.useState<UnifiedPayment[]>(initialPayments);
  const [clients, setClients] = React.useState<Client[]>(initialClients);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sourceFilter, setSourceFilter] = React.useState('all');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  
  const [rawSmsToShow, setRawSmsToShow] = React.useState<string | null>(null);
  const [manualLinkSms, setManualLinkSms] = React.useState<UnifiedPayment | null>(null);
  const [paymentToCancel, setPaymentToCancel] = React.useState<UnifiedPayment | null>(null);

  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

  const { toast } = useToast();

  React.useEffect(() => {
    // Set initial data, then subscribe for real-time updates
    setPayments(initialPayments);
    setClients(initialClients);

    const paymentsRef = ref(db, 'cash_records/');
    const clientsRef = ref(db, 'clients/');

    const unsubPayments = onValue(paymentsRef, (snapshot) => {
        const cashRecords: CashRecord[] = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
        const paymentRecords = cashRecords.filter(r => r.type === 'outflow');
        setPayments(paymentRecords.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });
    
    const unsubClients = onValue(clientsRef, (snapshot) => {
        setClients(snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : []);
    });

    return () => {
        unsubPayments();
        unsubClients();
    };
  }, [initialPayments, initialClients]);
  
  const filteredPayments = React.useMemo(() => {
    return payments.filter(p => {
        if (sourceFilter !== 'all' && p.source !== sourceFilter) return false;
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        
        if (dateRange?.from) {
            const txDate = new Date(p.date);
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
                (p.clientName && p.clientName.toLowerCase().includes(lowercasedSearch)) ||
                (p.recipientName && p.recipientName.toLowerCase().includes(lowercasedSearch)) ||
                (p.accountName && p.accountName.toLowerCase().includes(lowercasedSearch)) ||
                p.amount.toString().includes(lowercasedSearch)
            );
        }

        return true;
    });
  }, [payments, search, statusFilter, sourceFilter, dateRange]);

  const handleSmsStatusUpdate = async (id: string, status: CashRecord['status']) => {
    const result = await updateSmsTransactionStatus(id, status);
    if (result?.success) {
        toast({ title: "Status Updated", description: `Transaction marked as ${status}.`});
    } else {
        toast({ variant: "destructive", title: "Error", description: result.message });
    }
  };

  const handleManualLink = async (clientId: string) => {
      if (!manualLinkSms) return;
      const result = await linkSmsToClient(manualLinkSms.id, clientId);
       if (result?.success) {
          toast({ title: "Client Linked", description: `SMS successfully linked to client.`});
      } else {
          toast({ variant: "destructive", title: "Error", description: result.message });
      }
      setManualLinkSms(null);
  }

  const handleCancelPayment = async () => {
      if (!paymentToCancel) return;
      const result = await cancelCashPayment(paymentToCancel.id);
      if (result?.success) {
          toast({ title: "Payment Cancelled", description: "The payment has been successfully cancelled." });
      } else {
          toast({ variant: "destructive", title: "Error", description: result.message });
      }
      setPaymentToCancel(null);
  };
  
  const getStatusVariant = (status: UnifiedPayment['status']) => {
        switch(status) {
            case 'Pending': return 'secondary';
            case 'Matched': return 'default';
            case 'Used': return 'outline';
            case 'Cancelled': return 'destructive';
            default: return 'secondary';
        }
    }
  
    const selectedPayments = Object.keys(rowSelection).filter(id => rowSelection[id]);

    const handleSelectAll = (checked: boolean) => {
        const newSelection: Record<string, boolean> = {};
        if (checked) {
            filteredPayments.forEach(tx => {
                newSelection[tx.id] = true;
            });
        }
        setRowSelection(newSelection);
    };

  return (
    <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-2 py-4 flex-wrap">
            <Input 
                placeholder="Search by client, recipient, bank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />
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
        
        {selectedPayments.length > 0 && (
            <CashReceiptBulkActions 
                selectedReceipts={payments.filter(p => selectedPayments.includes(p.id))}
                onActionComplete={() => setRowSelection({})}
            />
        )}

        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-10 px-2">
                        <Checkbox
                            checked={Object.keys(rowSelection).length > 0 && filteredPayments.length > 0 && Object.keys(rowSelection).length === filteredPayments.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            aria-label="Select all"
                        />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client (Debited)</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center">Loading payments...</TableCell></TableRow>
                ) : filteredPayments.length > 0 ? (
                filteredPayments.map((payment) => (
                    <TableRow key={`${payment.source}-${payment.id}`} data-state={rowSelection[payment.id] && "selected"}>
                        <TableCell className="px-2">
                            <Checkbox
                                checked={rowSelection[payment.id] || false}
                                onCheckedChange={(checked) => setRowSelection(prev => ({...prev, [payment.id]: !!checked}))}
                                aria-label="Select row"
                            />
                        </TableCell>
                        <TableCell>{payment.date && !isNaN(new Date(payment.date).getTime()) ? format(new Date(payment.date), 'Pp') : 'N/A'}</TableCell>
                        <TableCell className="font-medium">{payment.clientName}</TableCell>
                        <TableCell>{payment.recipientName}</TableCell>
                        <TableCell>{payment.accountName}</TableCell>
                        <TableCell className="text-right font-mono">{new Intl.NumberFormat().format(payment.amount)} {payment.currency}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(payment.status)} className="capitalize">{payment.status}</Badge></TableCell>
                        <TableCell className="text-right">
                           <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {payment.source === 'SMS' && (
                                        <>
                                            <DropdownMenuItem onClick={() => setManualLinkSms(payment)}>Manually Link Client</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleSmsStatusUpdate(payment.id, 'Used')}>Mark as Used</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleSmsStatusUpdate(payment.id, 'Cancelled')}>Mark as Rejected</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setRawSmsToShow(payment.rawSms || 'No raw SMS content found.')}>View Raw SMS</DropdownMenuItem>
                                        </>
                                    )}
                                    {payment.source === 'Manual' && payment.status !== 'Cancelled' && (
                                        <>
                                            <DropdownMenuItem asChild>
                                                <Link href={`/modern-cash-records/${payment.id}/edit`}>
                                                    <Pencil className="mr-2 h-4 w-4" /> Edit Payment
                                                </Link>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setPaymentToCancel(payment)}>
                                                <Trash2 className="mr-2 h-4 w-4 text-destructive" /> Cancel Payment
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))
                ) : (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center">No cash payments found for the selected criteria.</TableCell></TableRow>
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

        <AlertDialog open={!!paymentToCancel} onOpenChange={(open) => !open && setPaymentToCancel(null)}>
             <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure you want to cancel this payment?</AlertDialogTitle>
                    <AlertDialogDescription>This action will mark the payment as "Cancelled". This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Close</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancelPayment}>Confirm Cancellation</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <ManualLinkDialog sms={manualLinkSms} clients={clients} onLink={handleManualLink} onOpenChange={(open) => !open && setManualLinkSms(null)} />
    </div>
  );
}
