
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, ModernUsdtRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createUsdtManualPayment, type UsdtPaymentState, searchClients } from '@/lib/actions';
import { format, parseISO } from 'date-fns';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { useRouter } from 'next/navigation';

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Recording...' : isEditing ? 'Save Changes' : 'Record Payment'}
        </Button>
    );
}

function ClientSelector({
  value,
  onValueChange,
  selectedClient,
  onSelect,
  disabled = false
}: {
  value: string;
  onValueChange: (value: string) => void;
  selectedClient: Client | null;
  onSelect: (client: Client | null) => void;
  disabled?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    
    const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        if (!open) return;
        if (value.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(async () => {
            const results = await searchClients(value);
            setSearchResults(results);
            setIsLoading(false);
        }, 300);

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [value, open]);
    
    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    const handleSelect = (client: Client) => {
        onSelect(client);
        onValueChange(client.name);
        setIsOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={disabled}>
                    {value || "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search clients..." value={value} onValueChange={onValueChange} />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                             {searchResults.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => handleSelect(client)}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                        <span>{client.name}</span>
                                        <span className="text-xs text-muted-foreground">{getPhone(client.phone)}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function UsdtManualPaymentForm({ record, clients }: { record?: ModernUsdtRecord, clients: Client[] }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);
    const actionWithId = createUsdtManualPayment.bind(null, record?.id || null);
    const [state, formAction] = useActionState<UsdtPaymentState, FormData>(actionWithId, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>();
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [clientSearch, setClientSearch] = React.useState("");

    React.useEffect(() => {
        if (!record) {
            setDate(new Date());
        } else {
            setDate(parseISO(record.date));
            const initialClient = clients.find(c => c.id === record.clientId);
            if(initialClient) {
                setSelectedClient(initialClient);
                setClientSearch(initialClient.name);
            }
        }
    }, [record, clients]);

    React.useEffect(() => {
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
             if (record?.id) {
                router.push('/modern-usdt-records');
            } else {
                formRef.current?.reset();
                setSelectedClient(null);
                setClientSearch("");
                setDate(new Date());
            }
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast, record, router]);
    
    const isEditing = !!record;
    const isSyncedRecord = isEditing && record.source === 'BSCScan';

    return (
        <form action={formAction} ref={formRef}>
             <Card>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Edit' : 'New'} USDT Manual Payment</CardTitle>
                    <CardDescription>{isEditing ? `Editing record ID: ${record.id}` : 'Record sending USDT to a client manually. This creates an outflow record.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")} disabled={isSyncedRecord}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus disabled={isSyncedRecord} /></PopoverContent>
                            </Popover>
                            <input type="hidden" name="date" value={date?.toISOString()} />
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="clientId">Paid To (Client)</Label>
                            <ClientSelector 
                                value={clientSearch}
                                onValueChange={setClientSearch}
                                selectedClient={selectedClient}
                                onSelect={setSelectedClient}
                            />
                           <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
                           <input type="hidden" name="clientName" value={selectedClient?.name || ''} />
                            {state?.errors?.recipientAddress && <p className="text-sm text-destructive">{state.errors.recipientAddress[0]}</p>}
                        </div>
                    </div>
                     
                    <div className="space-y-2">
                        <Label htmlFor="recipientAddress">Recipient BEP20 Address</Label>
                        <Input id="recipientAddress" name="recipientAddress" placeholder="0x..." required defaultValue={record?.clientWalletAddress} disabled={isSyncedRecord}/>
                        {state?.errors?.recipientAddress && <p className="text-sm text-destructive">{state.errors.recipientAddress[0]}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="amount">Amount (USDT)</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 500.00" defaultValue={record?.amount} disabled={isSyncedRecord}/>
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="txid">Transaction Hash (TxID)</Label>
                            <Input id="txid" name="txid" placeholder="Optional" defaultValue={record?.txHash} disabled={isSyncedRecord}/>
                        </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select name="status" defaultValue={record?.status || 'Confirmed'}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Used">Used</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Optional notes about the transaction" defaultValue={record?.notes}/>
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton isEditing={isEditing} />
                </CardFooter>
            </Card>
        </form>
    );
}
