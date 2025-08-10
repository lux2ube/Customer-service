
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
import type { CashReceipt, SmsTransaction, Client } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { MessageSquareText, MoreHorizontal, Calendar as CalendarIcon, X, Check, ChevronsUpDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { updateSmsTransactionStatus, linkSmsToClient } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { CashReceiptBulkActions } from './cash-receipt-bulk-actions';

const statuses: SmsTransaction['status'][] = ['pending', 'parsed', 'matched', 'used', 'rejected'];
const sources = ['Manual', 'SMS'];

// A unified type for the table
export type UnifiedReceipt = {
    id: string;
    date: string;
    clientName: string; // The credited client (matched_client_name for SMS)
    senderName: string; // The original sender (client_name from SMS)
    bankAccountName: string;
    amount: number;
    currency: string;
    remittanceNumber?: string;
    source: 'Manual' | 'SMS';
    status: CashReceipt['status'] | SmsTransaction['status'];
    rawSms?: string;
}

function ManualLinkDialog({ sms, clients, onLink, onOpenChange }: { sms: UnifiedReceipt | null, clients: Client[], onLink: (clientId: string) => void, onOpenChange: (open: boolean) => void }) {
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

export function CashReceiptsTable({ initialReceipts, initialClients }: { initialReceipts: UnifiedReceipt[], initialClients: Client[] }) {
  const [receipts, setReceipts] = React.useState<UnifiedReceipt[]>(initialReceipts);
  const [clients, setClients] = React.useState<Client[]>(initialClients);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [sourceFilter, setSourceFilter] = React.useState('all');
  const [dateRange, setDateRange] = React.useState<DateRange | undefined>(undefined);
  
  const [rawSmsToShow, setRawSmsToShow] = React.useState<string | null>(null);
  const [manualLinkSms, setManualLinkSms] = React.useState<UnifiedReceipt | null>(null);

  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

  const { toast } = useToast();

  React.useEffect(() => {
    // Set initial data, then subscribe for real-time updates
    setReceipts(initialReceipts);
    setClients(initialClients);

    const receiptsRef = ref(db, 'cash_receipts/');
    const smsRef = ref(db, 'sms_transactions/');
    const clientsRef = ref(db, 'clients/');

    const unsubReceipts = onValue(receiptsRef, (snapshot) => {
        const manualReceipts: CashReceipt[] = snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : [];
        setReceipts(currentReceipts => {
            const smsPart = currentReceipts.filter(r => r.source === 'SMS');
            const manualPart = manualReceipts.map(r => ({
                id: r.id, date: r.date, clientName: r.clientName, senderName: r.senderName,
                bankAccountName: r.bankAccountName, amount: r.amount, currency: r.currency,
                remittanceNumber: r.remittanceNumber, source: 'Manual', status: r.status,
            }));
            return [...smsPart, ...manualPart].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
    });

    const unsubSms = onValue(smsRef, (snapshot) => {
        const smsCredits: SmsTransaction[] = snapshot.exists() ? Object.values(snapshot.val()).filter((sms: any) => sms.type === 'credit') : [];
        setReceipts(currentReceipts => {
             const manualPart = currentReceipts.filter(r => r.source === 'Manual');
             const smsPart = smsCredits.map((sms: any) => ({
                id: sms.id, date: sms.parsed_at, clientName: sms.matched_client_name || 'Unmatched',
                senderName: sms.client_name, bankAccountName: sms.account_name || 'N/A', amount: sms.amount || 0,
                currency: sms.currency || '', remittanceNumber: sms.transaction_id, source: 'SMS',
                status: sms.status, rawSms: sms.raw_sms,
            }));
             return [...manualPart, ...smsPart].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        });
    });

    const unsubClients = onValue(clientsRef, (snapshot) => {
        setClients(snapshot.exists() ? Object.keys(snapshot.val()).map(key => ({ id: key, ...snapshot.val()[key] })) : []);
    });

    return () => {
        unsubReceipts();
        unsubSms();
        unsubClients();
    };
  }, [initialReceipts, initialClients]);
  
  const filteredReceipts = React.useMemo(() => {
    return receipts.filter(r => {
        if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        
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
                (r.bankAccountName && r.bankAccountName.toLowerCase().includes(lowercasedSearch)) ||
                (r.remittanceNumber && r.remittanceNumber.toLowerCase().includes(lowercasedSearch)) ||
                r.amount.toString().includes(lowercasedSearch)
            );
        }

        return true;
    });
  }, [receipts, search, statusFilter, sourceFilter, dateRange]);

  const handleSmsStatusUpdate = async (id: string, status: SmsTransaction['status']) => {
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
  
  const getStatusVariant = (status: UnifiedReceipt['status']) => {
        switch(status) {
            case 'pending': return 'secondary';
            case 'parsed': return 'secondary';
            case 'matched': return 'default';
            case 'used': return 'outline';
            case 'rejected': return 'destructive';
            case 'Cancelled': return 'destructive';
            case 'Confirmed': return 'default';
            default: return 'secondary';
        }
    }
  
    const selectedReceipts = Object.keys(rowSelection).filter(id => rowSelection[id]);

    const handleSelectAll = (checked: boolean) => {
        const newSelection: Record<string, boolean> = {};
        if (checked) {
            filteredReceipts.forEach(tx => {
                newSelection[tx.id] = true;
            });
        }
        setRowSelection(newSelection);
    };

  return (
    <div className="space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-2 py-4 flex-wrap">
            <Input 
                placeholder="Search by client, sender, bank..."
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
                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
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
        
        {selectedReceipts.length > 0 && (
            <CashReceiptBulkActions 
                selectedReceipts={receipts.filter(r => selectedReceipts.includes(r.id))}
                onActionComplete={() => setRowSelection({})}
            />
        )}

        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                    <TableHead className="w-10 px-2">
                        <Checkbox
                            checked={Object.keys(rowSelection).length > 0 && filteredReceipts.length > 0 && Object.keys(rowSelection).length === filteredReceipts.length}
                            onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            aria-label="Select all"
                        />
                    </TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Bank Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center">Loading receipts...</TableCell></TableRow>
                ) : filteredReceipts.length > 0 ? (
                filteredReceipts.map((receipt, index) => (
                    <TableRow key={`${receipt.source}-${receipt.id || index}`} data-state={rowSelection[receipt.id] && "selected"}>
                        <TableCell className="px-2">
                            <Checkbox
                                checked={rowSelection[receipt.id] || false}
                                onCheckedChange={(checked) => setRowSelection(prev => ({...prev, [receipt.id]: !!checked}))}
                                aria-label="Select row"
                            />
                        </TableCell>
                        <TableCell>{receipt.date && !isNaN(new Date(receipt.date).getTime()) ? format(new Date(receipt.date), 'Pp') : 'N/A'}</TableCell>
                        <TableCell className="font-medium">{receipt.clientName}</TableCell>
                        <TableCell>{receipt.senderName}</TableCell>
                        <TableCell>{receipt.bankAccountName}</TableCell>
                        <TableCell className="text-right font-mono">{new Intl.NumberFormat().format(receipt.amount)} {receipt.currency}</TableCell>
                        <TableCell><Badge variant={getStatusVariant(receipt.status)} className="capitalize">{receipt.status}</Badge></TableCell>
                        <TableCell className="text-right">
                           <DropdownMenu>
                                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {receipt.source === 'SMS' && (
                                        <>
                                            <DropdownMenuItem onClick={() => setManualLinkSms(receipt)}>Manually Link Client</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleSmsStatusUpdate(receipt.id, 'used')}>Mark as Used</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleSmsStatusUpdate(receipt.id, 'rejected')}>Mark as Rejected</DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setRawSmsToShow(receipt.rawSms || 'No raw SMS content found.')}>View Raw SMS</DropdownMenuItem>
                                        </>
                                    )}
                                    {receipt.source === 'Manual' && (
                                        <>
                                            <DropdownMenuItem disabled>Edit Receipt</DropdownMenuItem>
                                            <DropdownMenuItem disabled>Cancel Receipt</DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                ))
                ) : (
                    <TableRow><TableCell colSpan={8} className="h-24 text-center">No cash receipts found for the selected criteria.</TableCell></TableRow>
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

        <ManualLinkDialog sms={manualLinkSms} clients={clients} onLink={handleManualLink} onOpenChange={(open) => !open && setManualLinkSms(null)} />
    </div>
  );
}
