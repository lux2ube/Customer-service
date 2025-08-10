
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Check, ChevronsUpDown } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createJournalEntry, type JournalEntryFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { Account, Settings } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from './ui/skeleton';


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Recording...' : <><Save className="mr-2 h-4 w-4" />Record Entry</>}
        </Button>
    );
}


export function JournalEntryForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<JournalEntryFormState, FormData>(createJournalEntry, undefined);
    
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const [loading, setLoading] = React.useState(true);

    const [debitAccount, setDebitAccount] = React.useState<Account | null>(null);
    const [creditAccount, setCreditAccount] = React.useState<Account | null>(null);

    const [debitAmount, setDebitAmount] = React.useState<string>("");
    const [creditAmount, setCreditAmount] = React.useState<string>("");
    const [amountUSD, setAmountUSD] = React.useState<number>(0);

    const [lastEdited, setLastEdited] = React.useState<'debit' | 'credit' | null>(null);

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                setAccounts(allAccounts.filter(acc => !acc.isGroup && acc.currency));
            } else {
                setAccounts([]);
            }
            setLoading(false);
        });
        
        const settingsRef = ref(db, 'settings');
        const unsubscribeSettings = onValue(settingsRef, (snapshot) => {
            setSettings(snapshot.val());
        });

        return () => { 
            unsubscribeAccounts();
            unsubscribeSettings();
        };
    }, []);

    React.useEffect(() => {
        if (!settings || (!debitAccount && !creditAccount) || !lastEdited) return;

        const getRate = (currency?: string) => {
            if (!currency || !settings) return 1;
            const fiatRate = (settings.fiat_rates as any)?.find((r:any) => r.currency === currency);
            if (fiatRate) return fiatRate.systemBuy || 1; // Use a consistent rate like systemBuy
            if (currency === 'USDT' || currency === 'USD') return 1;
            return 1;
        };

        const debitRate = getRate(debitAccount?.currency);
        const creditRate = getRate(creditAccount?.currency);

        if (lastEdited === 'debit') {
            const debitValue = parseFloat(debitAmount);
            if (!isNaN(debitValue) && debitRate > 0 && creditRate > 0) {
                const usd = debitValue / debitRate;
                const credit = usd * creditRate;
                setCreditAmount(credit.toFixed(2));
                setAmountUSD(usd);
            }
        } else if (lastEdited === 'credit') {
            const creditValue = parseFloat(creditAmount);
            if (!isNaN(creditValue) && debitRate > 0 && creditRate > 0) {
                const usd = creditValue / creditRate;
                const debit = usd * debitRate;
                setDebitAmount(debit.toFixed(2));
                setAmountUSD(usd);
            }
        }
    }, [debitAmount, creditAmount, debitAccount, creditAccount, settings, lastEdited]);
    
    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({ variant: 'destructive', title: 'Error Recording Entry', description: state.message });
        }
    }, [state, toast]);

    const handleDebitSelect = (id: string) => {
        const acc = accounts.find(a => a.id === id);
        setDebitAccount(acc || null);
    };

    const handleCreditSelect = (id: string) => {
        const acc = accounts.find(a => a.id === id);
        setCreditAccount(acc || null);
    };

    if (loading) {
        return (
            <Card>
                <CardHeader><CardTitle>Loading Form...</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        )
    }

  return (
    <form action={formAction} className="space-y-4">
        <Card>
            <CardHeader>
                <CardTitle>Record Journal Entry</CardTitle>
                <CardDescription>Record a transfer between two internal accounts. Conversions are handled automatically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="grid md:grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <Label htmlFor="date">Date</Label>
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                        </PopoverContent>
                        </Popover>
                        <input type="hidden" name="date" value={date?.toISOString()} />
                        {state?.errors?.date && <p className="text-sm text-destructive">{state.errors.date[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="description">Description</Label>
                        <Input id="description" name="description" placeholder="e.g., Transfer to cover expenses" aria-describedby="description-error" />
                        {state?.errors?.description && <p id="description-error" className="text-sm text-destructive">{state.errors.description[0]}</p>}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 items-start">
                    <div className="space-y-1.5">
                        <Label>From (Debit)</Label>
                        <AccountSelector 
                            name="debit_account" 
                            accounts={accounts} 
                            onAccountSelect={handleDebitSelect}
                            placeholder="Select a source account..."
                        />
                        {state?.errors?.debit_account && <p className="text-sm text-destructive">{state.errors.debit_account[0]}</p>}
                    </div>
                     <div className="space-y-1.5">
                        <Label htmlFor="debit_amount">Debit Amount ({debitAccount?.currency || '...'})</Label>
                        <Input 
                            id="debit_amount" 
                            name="debit_amount" 
                            type="number" 
                            step="any" 
                            placeholder="e.g., 1000.00" 
                            aria-describedby="debit-amount-error"
                            value={debitAmount}
                            onChange={(e) => {
                                setDebitAmount(e.target.value)
                                setLastEdited('debit');
                            }}
                            disabled={!debitAccount}
                        />
                        {state?.errors?.debit_amount && <p id="debit-amount-error" className="text-sm text-destructive">{state.errors.debit_amount[0]}</p>}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 items-start">
                     <div className="space-y-1.5">
                        <Label>To (Credit)</Label>
                        <AccountSelector 
                            name="credit_account" 
                            accounts={accounts} 
                            onAccountSelect={handleCreditSelect}
                            placeholder="Select a destination account..."
                        />
                        {state?.errors?.credit_account && <p className="text-sm text-destructive">{state.errors.credit_account[0]}</p>}
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="credit_amount">Credit Amount ({creditAccount?.currency || '...'})</Label>
                        <Input 
                            id="credit_amount" 
                            name="credit_amount" 
                            type="number" 
                            step="any" 
                            placeholder="e.g., 150000.00" 
                            aria-describedby="credit-amount-error"
                            value={creditAmount}
                            onChange={(e) => {
                                setCreditAmount(e.target.value)
                                setLastEdited('credit');
                            }}
                            disabled={!creditAccount}
                        />
                        {state?.errors?.credit_amount && <p id="credit-amount-error" className="text-sm text-destructive">{state.errors.credit_amount[0]}</p>}
                    </div>
                </div>

                {/* Hidden fields for server action */}
                <input type="hidden" name="debit_currency" value={debitAccount?.currency || ''} />
                <input type="hidden" name="credit_currency" value={creditAccount?.currency || ''} />
                <input type="hidden" name="amount_usd" value={amountUSD} />
                
            </CardContent>
            <CardFooter className="flex justify-end">
                <SubmitButton />
            </CardFooter>
        </Card>
    </form>
  );
}

function AccountSelector({ name, accounts, placeholder, onAccountSelect }: { name: string, accounts: Account[], placeholder: string, onAccountSelect: (id: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <>
    <input type="hidden" name={name} value={value} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {value
            ? accounts.find((acc) => acc.id === value)?.name
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account with a currency found.</CommandEmpty>
            <CommandGroup>
                {accounts.map((acc) => (
                <CommandItem
                    key={acc.id}
                    value={`${acc.id} ${acc.name} ${acc.currency}`}
                    onSelect={() => {
                        setValue(acc.id)
                        setOpen(false)
                        onAccountSelect(acc.id)
                    }}
                >
                    <Check
                    className={cn(
                        "mr-2 h-4 w-4",
                        value === acc.id ? "opacity-100" : "opacity-0"
                    )}
                    />
                    <div className="flex justify-between w-full">
                        <span>{acc.name}</span>
                        <span className="text-muted-foreground">{acc.id} ({acc.currency})</span>
                    </div>
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

    