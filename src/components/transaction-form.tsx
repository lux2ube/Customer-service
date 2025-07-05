
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Check, ChevronsUpDown } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createTransaction, type TransactionFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Settings, Transaction } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Separator } from './ui/separator';
import { WhatsAppLinkGenerator } from './whatsapp-link-generator';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? 'Recording...' : <><Save className="mr-2 h-4 w-4" />Record Transaction</>}
        </Button>
    );
}

export function TransactionForm({ transaction, client }: { transaction?: Transaction, client?: Client | null }) {
    const { toast } = useToast();
    const action = transaction ? createTransaction.bind(null, transaction.id) : createTransaction.bind(null, null);
    const [state, formAction] = useActionState<TransactionFormState, FormData>(action, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>(transaction ? new Date(transaction.date) : new Date());
    const [clients, setClients] = React.useState<Client[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);

    // Form state that drives calculations
    const [amount, setAmount] = React.useState(transaction?.amount || 0);
    const [currency, setCurrency] = React.useState(transaction?.currency || 'USD');
    const [transactionType, setTransactionType] = React.useState<'Deposit' | 'Withdraw'>(transaction?.type || 'Deposit');
    
    // Calculated values for the preview
    const [usdValue, setUsdValue] = React.useState(transaction?.amount_usd || 0);
    const [fee, setFee] = React.useState(transaction?.fee_usd || 0);
    const [expense, setExpense] = React.useState(transaction?.expense_usd || 0);
    const [usdtAmount, setUsdtAmount] = React.useState(transaction?.amount_usdt || 0);
    const [isUsdtManuallyEdited, setIsUsdtManuallyEdited] = React.useState(!!transaction?.hash);

    React.useEffect(() => {
        const clientsRef = ref(db, 'clients');
        const unsubscribeClients = onValue(clientsRef, (snapshot) => {
             const data = snapshot.val();
             if (data) {
                setClients(Object.keys(data).map(key => ({ id: key, ...data[key] })));
             } else {
                setClients([]);
             }
        });

        const accountsRef = ref(db, 'accounts');
        const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
             if (data) {
                const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                setBankAccounts(allAccounts.filter(acc => 
                    !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'
                ));
                setCryptoWallets(allAccounts.filter(acc =>
                    !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'
                ));
             } else {
                setBankAccounts([]);
                setCryptoWallets([]);
             }
        });

        const settingsRef = ref(db, 'settings');
        const unsubscribeSettings = onValue(settingsRef, (snapshot) => {
            setSettings(snapshot.val());
        });

        return () => {
            unsubscribeClients();
            unsubscribeAccounts();
            unsubscribeSettings();
        };
    }, []);

    // Perform calculations whenever an input changes
    React.useEffect(() => {
        if (!settings) return;

        let calculatedUsdValue = 0;
        switch(currency) {
            case 'USD': calculatedUsdValue = amount; break;
            case 'USDT': calculatedUsdValue = amount * (settings.usdt_usd || 1); break;
            case 'YER': calculatedUsdValue = amount * (settings.yer_usd || 0); break;
            case 'SAR': calculatedUsdValue = amount * (settings.sar_usd || 0); break;
        }
        setUsdValue(calculatedUsdValue);
        
        let calculatedFee = 0;
        let calculatedExpense = 0;
        const minimumFee = settings.minimum_fee_usd || 1;

        if (transactionType === 'Deposit') {
            if (isUsdtManuallyEdited) {
                const diff = calculatedUsdValue - usdtAmount;
                if (diff >= 0) {
                    calculatedFee = diff;
                } else {
                    calculatedExpense = -diff; // Expense is the absolute value of the negative difference
                }
            } else {
                const percentageFee = calculatedUsdValue * ((settings.deposit_fee_percent || 0) / 100);
                calculatedFee = Math.max(percentageFee, minimumFee);
                const newUsdtAmount = Number((calculatedUsdValue - calculatedFee).toFixed(2));
                if (usdtAmount !== newUsdtAmount) {
                    setUsdtAmount(newUsdtAmount);
                }
            }
        } else { // Withdraw
            if (isUsdtManuallyEdited) {
                const diff = usdtAmount - calculatedUsdValue;
                 if (diff >= 0) {
                    calculatedFee = diff;
                } else {
                    calculatedExpense = -diff;
                }
            } else {
                const percentageFee = calculatedUsdValue * ((settings.withdraw_fee_percent || 0) / 100);
                calculatedFee = Math.max(percentageFee, minimumFee);
                const newUsdtAmount = Number((calculatedUsdValue + calculatedFee).toFixed(2));
                if (usdtAmount !== newUsdtAmount) {
                     setUsdtAmount(newUsdtAmount);
                }
            }
        }
        
        setFee(calculatedFee);
        setExpense(calculatedExpense);

    }, [amount, currency, transactionType, settings, isUsdtManuallyEdited, usdtAmount]);

    React.useEffect(() => {
        if (state?.message) {
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: state.message });
        }
    }, [state, toast]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAmount(Number(e.target.value));
        if (!transaction?.hash) {
            setIsUsdtManuallyEdited(false);
        }
    }

    const handleTypeChange = (v: 'Deposit' | 'Withdraw') => {
        setTransactionType(v);
        if (!transaction?.hash) {
            setIsUsdtManuallyEdited(false);
        }
    }
    
    const handleUsdtAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsdtAmount(Number(e.target.value));
        setIsUsdtManuallyEdited(true);
    }

    const handleBankAccountSelect = (accountId: string) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (selectedAccount && selectedAccount.currency) {
            setCurrency(selectedAccount.currency);
            if (!transaction?.hash) {
                setIsUsdtManuallyEdited(false);
            }
        }
    }

    return (
        <form action={formAction} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Required Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="date">Date and Time</Label>
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
                                {state?.errors?.date && <p className="text-sm text-destructive">{state.errors.date[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Transaction Type</Label>
                                <Select name="type" required defaultValue={transactionType} onValueChange={handleTypeChange}>
                                    <SelectTrigger><SelectValue placeholder="Select type..."/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Deposit">Deposit</SelectItem>
                                        <SelectItem value="Withdraw">Withdraw</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                           <Label>Client</Label>
                            <DataCombobox name="clientId" data={clients.map(c => ({id: c.id, name: `${c.name} (${c.phone})`}))} placeholder="Search by name or phone..." defaultValue={transaction?.clientId} />
                            {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                               <Label>Bank Account</Label>
                                <DataCombobox name="bankAccountId" data={bankAccounts.map(b => ({id: b.id, name: `${b.name} (${b.currency})`}))} placeholder="Select a bank account..." defaultValue={transaction?.bankAccountId} onSelect={handleBankAccountSelect}/>
                            </div>
                            <div className="space-y-2">
                               <Label>Crypto Wallet</Label>
                                <DataCombobox name="cryptoWalletId" data={cryptoWallets.map(w => ({id: w.id, name: `${w.name} (${w.id})`}))} placeholder="Select a crypto wallet..." defaultValue={transaction?.cryptoWalletId}/>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount ({currency})</Label>
                                <Input id="amount" name="amount" type="number" step="any" placeholder="e.g., 1000.00" required value={amount} onChange={handleAmountChange}/>
                                {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="attachment_url">Upload Transaction Image</Label>
                                <Input id="attachment_url" name="attachment_url" type="file" />
                            </div>
                        </div>
                         {/* Hidden input to pass currency to server action */}
                         <input type="hidden" name="currency" value={currency} />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Payment Preview</CardTitle>
                        <CardDescription>Values are calculated automatically. Final USDT amount can be overridden.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className='flex justify-between items-center'>
                            <Label>Amount in USD</Label>
                            <span className="font-mono text-lg">${usdValue.toFixed(2)}</span>
                        </div>
                        <Separator />
                        <div className='flex justify-between items-center'>
                            <Label>Fee</Label>
                            <span className="font-mono text-lg">${fee.toFixed(2)}</span>
                        </div>
                        {expense > 0 && (
                            <>
                                <Separator />
                                <div className='flex justify-between items-center text-destructive'>
                                    <Label className="font-bold text-destructive">Expense / Loss</Label>
                                    <span className="font-mono text-lg font-bold">${expense.toFixed(2)}</span>
                                </div>
                            </>
                        )}
                         <Separator />
                        <div className='flex justify-between items-center'>
                            <Label htmlFor="amount_usdt" className="font-bold">Final USDT Amount</Label>
                             <Input
                                id="amount_usdt"
                                name="amount_usdt"
                                type="number"
                                step="any"
                                value={usdtAmount}
                                onChange={handleUsdtAmountChange}
                                className="w-48 text-right font-mono text-lg font-bold"
                            />
                        </div>
                        {/* Hidden inputs to pass calculated values to the server action */}
                        <input type="hidden" name="amount_usd" value={usdValue.toFixed(2)} />
                        <input type="hidden" name="fee_usd" value={fee.toFixed(2)} />
                        <input type="hidden" name="expense_usd" value={expense.toFixed(2)} />
                    </CardContent>
                    <CardFooter>
                        <SubmitButton />
                    </CardFooter>
                </Card>
            </div>
            <div className="lg:col-span-1 space-y-6">
                {transaction && client && (
                    <WhatsAppLinkGenerator transaction={transaction} client={client} />
                )}
                 <Card>
                    <CardHeader>
                        <CardTitle>Optional Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." defaultValue={transaction?.notes}/>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="remittance_number">Remittance Number</Label>
                                <Input id="remittance_number" name="remittance_number" defaultValue={transaction?.remittance_number}/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="hash">Crypto Hash</Label>
                                <Input id="hash" name="hash" defaultValue={transaction?.hash} />
                            </div>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="client_wallet_address">Client Wallet Address</Label>
                            <Input id="client_wallet_address" name="client_wallet_address" defaultValue={transaction?.client_wallet_address}/>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select name="status" defaultValue={transaction?.status || "Pending"}>
                                    <SelectTrigger><SelectValue/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Pending">Pending</SelectItem>
                                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                             <div className="space-y-2">
                                <Label>Need Flag Review</Label>
                                <Select name="flags" defaultValue={transaction?.flags ? transaction.flags[0] : undefined}>
                                     <SelectTrigger><SelectValue placeholder="Add a flag..."/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="AML">AML</SelectItem>
                                        <SelectItem value="KYC">KYC</SelectItem>
                                        <SelectItem value="Blacklisted">Blacklisted</SelectItem>
                                        <SelectItem value="Other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </form>
    );
}

function DataCombobox({ name, data, placeholder, defaultValue, onSelect }: { name: string, data: {id: string, name: string}[], placeholder: string, defaultValue?: string, onSelect?: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(defaultValue || "");

  return (
    <>
    <input type="hidden" name={name} value={value} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {value ? data.find((d) => d.id === value)?.name : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
                {data.map((d) => (
                <CommandItem
                    key={d.id}
                    value={`${d.id} ${d.name}`}
                    onSelect={() => { 
                        setValue(d.id);
                        setOpen(false);
                        onSelect?.(d.id);
                    }}>
                    <Check className={cn("mr-2 h-4 w-4", value === d.id ? "opacity-100" : "opacity-0")}/>
                    <span>{d.name}</span>
                </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    </>
  )
}
