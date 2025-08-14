

'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
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
import type { Client, Account, FiatRate, ModernCashRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createCashReceipt, type CashReceiptFormState, searchClients } from '@/lib/actions';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';

function SubmitButton({ isEditing, onFormSubmit }: { isEditing: boolean, onFormSubmit?: () => void }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} onClick={onFormSubmit}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    {isEditing ? 'Save Changes' : 'Record Receipt'}
                </>
            )}
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
                            disabled={disabled}
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

export function CashReceiptForm({ record, clients, bankAccounts, onFormSubmit }: { record?: ModernCashRecord, clients: Client[], bankAccounts: Account[], onFormSubmit?: () => void }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);
    const actionWithId = createCashReceipt.bind(null, record?.id || null);
    const [state, formAction] = useActionState<CashReceiptFormState, FormData>(actionWithId, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>(record ? parseISO(record.date) : undefined);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [clientSearch, setClientSearch] = React.useState("");

    const [selectedBankAccountId, setSelectedBankAccountId] = React.useState(record?.accountId || '');
    const [amount, setAmount] = React.useState(record?.amount?.toString() || '');
    const [amountUsd, setAmountUsd] = React.useState(record?.amountUsd || 0);
    const [senderName, setSenderName] = React.useState(record?.senderName || '');

    const [fiatRates, setFiatRates] = React.useState<Record<string, FiatRate>>({});
    
     React.useEffect(() => {
        if (!record) {
            setDate(new Date());
        } else {
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
            setAmountUsd(0);
            return;
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) {
            setAmountUsd(0);
            return;
        }
        
        if (selectedAccount.currency === 'USD') {
            setAmountUsd(numericAmount);
            return;
        }

        const rateInfo = fiatRates[selectedAccount.currency];
        if (rateInfo && rateInfo.clientBuy > 0) {
            setAmountUsd(numericAmount / rateInfo.clientBuy);
        } else {
            setAmountUsd(0);
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
                setSenderName('');
            }
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast, record, router]);
    
    React.useEffect(() => {
        if (selectedClient) {
            setClientSearch(selectedClient.name);
        }
    }, [selectedClient]);

    const isEditing = !!record;
    const isSmsRecord = isEditing && record.source === 'SMS';
    const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccountId);

    return (
        <form action={formAction} ref={formRef}>
             <Card>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Edit' : 'New'} Cash Receipt</CardTitle>
                    <CardDescription>Fill in the details of the cash transaction.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                             <Label>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")} disabled={isSmsRecord}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent>
                            </Popover>
                            <input type="hidden" name="date" value={date?.toISOString() || ''} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bankAccountId">Received In (Bank Account)</Label>
                            <Select name="bankAccountId" required value={selectedBankAccountId} onValueChange={setSelectedBankAccountId} disabled={isSmsRecord}>
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
                            <Label htmlFor="amount">Amount Received ({selectedAccount?.currency || '...'})</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={isSmsRecord} />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Equivalent Amount (USD)</Label>
                            <Input value={amountUsd > 0 ? amountUsd.toFixed(2) : '0.00'} readOnly disabled />
                            <input type="hidden" name="amountUsd" value={amountUsd} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clientId">Credit to Client Account</Label>
                        <ClientSelector
                          value={clientSearch}
                          onValueChange={setClientSearch}
                          selectedClient={selectedClient}
                          onSelect={setSelectedClient}
                        />
                        <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
                        {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="senderName">Sender Name</Label>
                        <Input id="senderName" name="senderName" placeholder="e.g., Ahmed from the corner store" value={senderName} onChange={(e) => setSenderName(e.target.value)} required disabled={isSmsRecord} />
                        {state?.errors?.senderName && <p className="text-sm text-destructive">{state.errors.senderName[0]}</p>}
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="remittanceNumber">Remittance Number</Label>
                            <Input id="remittanceNumber" name="remittanceNumber" placeholder="Optional" defaultValue={record?.notes} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="note">Note</Label>
                            <Textarea id="note" name="note" placeholder="Optional notes about the transaction" defaultValue={record?.notes} />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton isEditing={isEditing} onFormSubmit={onFormSubmit} />
                </CardFooter>
            </Card>
        </form>
    );
}
