
'use client';

import * as React from 'react';
import { useActionState, useFormStatus } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, Account, FiatRate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createCashReceipt, type CashReceiptFormState } from '@/lib/actions/transaction';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    Record Receipt
                </>
            )}
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

export function CashReceiptForm({ clients, bankAccounts }: { clients: Client[], bankAccounts: Account[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);
    const [state, formAction] = useActionState<CashReceiptFormState, FormData>(createCashReceipt, undefined);
    
    const [selectedClientId, setSelectedClientId] = React.useState('');
    const [selectedBankAccountId, setSelectedBankAccountId] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [amountUsd, setAmountUsd] = React.useState(0);
    const [senderName, setSenderName] = React.useState('');

    const [fiatRates, setFiatRates] = React.useState<Record<string, FiatRate>>({});

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
            formRef.current?.reset();
            setSelectedClientId('');
            setSelectedBankAccountId('');
            setAmount('');
            setSenderName('');
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast]);
    
    const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccountId);

    return (
        <form action={formAction} ref={formRef}>
             <Card>
                <CardHeader>
                    <CardTitle>Cash Receipt Details</CardTitle>
                    <CardDescription>Fill in the details of the cash transaction.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="bankAccountId">Received In (Bank Account)</Label>
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
                    
                     <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="amount">Amount Received ({selectedAccount?.currency || '...'})</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
                         <ClientSelector clients={clients} selectedClientId={selectedClientId} onSelect={setSelectedClientId} />
                        <input type="hidden" name="clientId" value={selectedClientId} />
                         {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="senderName">Sender Name</Label>
                        <Input id="senderName" name="senderName" placeholder="e.g., Ahmed from the corner store" value={senderName} onChange={(e) => setSenderName(e.target.value)} required />
                        {state?.errors?.senderName && <p className="text-sm text-destructive">{state.errors.senderName[0]}</p>}
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="remittanceNumber">Remittance Number</Label>
                            <Input id="remittanceNumber" name="remittanceNumber" placeholder="Optional" />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="note">Note</Label>
                            <Textarea id="note" name="note" placeholder="Optional notes about the transaction" />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
