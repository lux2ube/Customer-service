
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
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions';
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

function ClientSelector({ clients, selectedClientId, onSelect, disabled = false }: { clients: Client[], selectedClientId: string, onSelect: (clientId: string) => void, disabled?: boolean }) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={disabled}>
                    {selectedClientId ? clients.find(c => c.id === selectedClientId)?.name : "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                            {clients.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={() => {
                                        onSelect(client.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn("mr-2 h-4 w-4", selectedClientId === client.id ? "opacity-100" : "opacity-0")} />
                                    {client.name}
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
    
    const [date, setDate] = React.useState<Date | undefined>(record ? parseISO(record.date) : undefined);
    const [selectedClientId, setSelectedClientId] = React.useState(record?.clientId || '');

    React.useEffect(() => {
        if (!record) {
            setDate(new Date());
        }
    }, [record]);

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
                setSelectedClientId('');
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
                            <ClientSelector clients={clients} selectedClientId={selectedClientId} onSelect={setSelectedClientId} />
                           <input type="hidden" name="clientId" value={selectedClientId} />
                           <input type="hidden" name="clientName" value={clients.find(c => c.id === selectedClientId)?.name || ''} />
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
