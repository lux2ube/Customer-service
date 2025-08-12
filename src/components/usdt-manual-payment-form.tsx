
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
import { Textarea } from './ui/textarea';
import type { Client } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions';
import { format } from 'date-fns';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Recording...' : 'Record Payment'}
        </Button>
    );
}

function ClientSelector({ clients, selectedClientId, onSelect }: { clients: Client[], selectedClientId: string, onSelect: (clientId: string) => void }) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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

export function UsdtManualPaymentForm({ clients }: { clients: Client[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);
    const [state, formAction] = useActionState<UsdtPaymentState, FormData>(createUsdtManualPayment, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [amount, setAmount] = React.useState('');

    React.useEffect(() => {
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
            formRef.current?.reset();
            setSelectedClientId('');
            setAmount('');
            setDate(new Date());
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction} ref={formRef}>
             <Card>
                <CardHeader>
                    <CardTitle>USDT Manual Payment</CardTitle>
                    <CardDescription>Record sending USDT to a client manually. This creates an outflow record.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
                            </Popover>
                            <input type="hidden" name="date" value={date?.toISOString()} />
                        </div>
                        <div className="space-y-2">
                           <Label htmlFor="clientId">Paid To (Client)</Label>
                            <ClientSelector clients={clients} selectedClientId={selectedClientId} onSelect={setSelectedClientId} />
                           <input type="hidden" name="clientId" value={selectedClientId} />
                            {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                        </div>
                    </div>
                     
                    <div className="space-y-2">
                        <Label htmlFor="recipientAddress">Recipient BEP20 Address</Label>
                        <Input id="recipientAddress" name="recipientAddress" placeholder="0x..." required />
                        {state?.errors?.recipientAddress && <p className="text-sm text-destructive">{state.errors.recipientAddress[0]}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="amount">Amount (USDT)</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 500.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="txid">Transaction Hash (TxID)</Label>
                            <Input id="txid" name="txid" placeholder="Optional" />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea id="notes" name="notes" placeholder="Optional notes about the transaction" />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
