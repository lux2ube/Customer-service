

'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Loader2, Check, ChevronsUpDown, ClipboardPaste, Calendar as CalendarIcon, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, Account, CashRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createCashReceipt, type CashReceiptFormState } from '@/lib/actions/financial-records';
import { searchClients } from '@/lib/actions/client';
import { useFormHotkeys } from '@/hooks/use-form-hotkeys';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { format, parseISO } from 'date-fns';

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    {isEditing ? 'Save Changes' : 'Record Payment'}
                </>
            )}
        </Button>
    );
}

function ClientSelector({
  value,
  onValueChange,
  onSelect
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (client: Client | null) => void;
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
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="relative w-full">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Search client by name or phone..."
                            value={value}
                            onValueChange={onValueChange}
                        />
                    </Command>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && searchResults.length === 0 && value.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => handleSelect(client)}>
                                    <Check className={cn("mr-2 h-4 w-4", value === client.name ? "opacity-100" : "opacity-0")} />
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

export function CashPaymentForm({ record, clients, bankAccounts }: { record?: CashRecord, clients: Client[], bankAccounts: Account[] }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);
    const actionWithId = createCashReceipt.bind(null, record?.id || null);
    useFormHotkeys(formRef);
    const [state, formAction] = useActionState<CashReceiptFormState, FormData>(actionWithId, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>(record ? parseISO(record.date) : new Date());
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [clientSearch, setClientSearch] = React.useState("");

    const [selectedBankAccountId, setSelectedBankAccountId] = React.useState(record?.accountId || '');
    const [amount, setAmount] = React.useState<string | number>(record?.amount || '');
    const [amountusd, setAmountusd] = React.useState<number>(record?.amountusd || 0);
    const [recipientName, setRecipientName] = React.useState(record?.recipientName || '');
    const [notes, setNotes] = React.useState(record?.notes || '');
    const [status, setStatus] = React.useState<string>(record?.status || 'Confirmed');

    const [fiatRates, setFiatRates] = React.useState<Record<string, any>>({});
    
     React.useEffect(() => {
        if (record) {
            const initialClient = clients.find(c => c.id === record.clientId);
            if(initialClient) {
                setSelectedClient(initialClient);
                setClientSearch(initialClient.name);
            }
        }
    }, [record, clients]);

     React.useEffect(() => {
        const fiatRatesRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
        const unsubFiat = onValue(fiatRatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                const lastEntry = data[lastEntryKey];
                setFiatRates(lastEntry.rates || {});
            }
        });
        return () => unsubFiat();
    }, []);

    React.useEffect(() => {
        const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccountId);
        if (!selectedAccount || !selectedAccount.currency) {
            setAmountusd(0);
            return;
        }

        const numericAmount = parseFloat(String(amount));
        if (isNaN(numericAmount)) {
            setAmountusd(0);
            return;
        }
        
        if (selectedAccount.currency === 'USD') {
            setAmountusd(numericAmount);
            return;
        }

        const rateInfo = fiatRates[selectedAccount.currency];
        if (rateInfo && rateInfo.clientSell > 0) {
            setAmountusd(numericAmount / rateInfo.clientSell);
        } else {
            setAmountusd(0);
        }
    }, [amount, selectedBankAccountId, bankAccounts, fiatRates]);

    React.useEffect(() => {
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
            if (record?.id) {
                router.push('/modern-cash-records');
            } else {
                formRef.current?.reset();
                setSelectedClient(null);
                setClientSearch("");
                setSelectedBankAccountId('');
                setAmount('');
                setRecipientName('');
                setNotes('');
            }
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast, record, router]);
    
    const handleClientSelect = (client: Client | null) => {
        setSelectedClient(client);
        if(client) {
            setClientSearch(client.name);
        }
    };
    
    const isEditing = !!record;
    const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccountId);

    return (
        <form action={formAction} ref={formRef}>
            <input type="hidden" name="type" value="outflow" />
             <Card>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Edit' : 'New'} Cash Payment</CardTitle>
                    <CardDescription>Fill in the details of the cash payment.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="status">Status</Label>
                        <Select name="status" value={status} onValueChange={setStatus}>
                            <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Confirmed">Confirmed (Auto-journaled)</SelectItem>
                                <SelectItem value="Cancelled">Cancelled</SelectItem>
                                <SelectItem value="Used">Used</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

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
                            <input type="hidden" name="date" value={date?.toISOString() || ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bankAccountId">Paid From (Bank Account)</Label>
                            <Select name="bankAccountId" required value={selectedBankAccountId} onValueChange={setSelectedBankAccountId}>
                                <SelectTrigger><SelectValue placeholder="Select bank account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(account => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.name} ({account.currency})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
                        </div>
                    </div>


                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount Paid ({selectedAccount?.currency || '...'})</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                         <div className="space-y-2">
                            <Label>Equivalent Amount (USD)</Label>
                            <Input value={amountusd > 0 ? amountusd.toFixed(2) : '0.00'} readOnly disabled />
                            <input type="hidden" name="amountusd" value={amountusd} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clientId">Debit from Client Account</Label>
                        <ClientSelector
                          value={clientSearch}
                          onValueChange={setClientSearch}
                          onSelect={handleClientSelect}
                        />
                        <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
                         {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="recipientName">Recipient Name (if not a client)</Label>
                        <Input id="recipientName" name="recipientName" placeholder="e.g., John Doe" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="remittanceNumber">Remittance Number</Label>
                            <Input id="remittanceNumber" name="remittanceNumber" placeholder="Optional" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="note">Notes</Label>
                            <Textarea id="note" name="note" placeholder="Optional notes about the transaction" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
