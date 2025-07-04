'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Check, ChevronsUpDown } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createJournalEntry, type FormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Account } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';


// This should be fetched or stored in a central place in the future
const initialAccounts: Account[] = [
    { id: '101', name: 'Cash - YER', type: 'Assets', isGroup: false },
    { id: '102', name: 'Cash - USD', type: 'Assets', isGroup: false },
    { id: '103', name: 'Cash - SAR', type: 'Assets', isGroup: false },
    { id: '110', name: 'Bank - YER', type: 'Assets', isGroup: false },
    { id: '111', name: 'Bank - USD', type: 'Assets', isGroup: false },
    { id: '112', name: 'Bank - SAR', type: 'Assets', isGroup: false },
    { id: '120', name: 'USDT Wallet (BEP20)', type: 'Assets', isGroup: false },
    { id: '130', name: 'Pending Fiat Receivables', type: 'Assets', isGroup: false },
    { id: '140', name: 'Pending Crypto Receivables', type: 'Assets', isGroup: false },
    { id: '201', name: 'Client USDT Liability', type: 'Liabilities', isGroup: false },
    { id: '202', name: 'Pending Withdrawals', type: 'Liabilities', isGroup: false },
    { id: '210', name: 'AML-Held Accounts', type: 'Liabilities', isGroup: false },
    { id: '220', name: 'Regulatory Liabilities', type: 'Liabilities', isGroup: false },
    { id: '301', name: 'Owner’s Equity', type: 'Equity', isGroup: false },
    { id: '302', name: 'Retained Earnings', type: 'Equity', isGroup: false },
    { id: '401', name: 'Deposit Fees (USD)', type: 'Income', isGroup: false },
    { id: '402', name: 'Withdraw Fees (USD)', type: 'Income', isGroup: false },
    { id: '403', name: 'Exchange Margin Profit', type: 'Income', isGroup: false },
    { id: '501', name: 'Gas Fees (BNB Network)', type: 'Expenses', isGroup: false },
    { id: '502', name: 'Bank Transfer Fees', type: 'Expenses', isGroup: false },
    { id: '503', name: 'Operations / Admin', type: 'Expenses', isGroup: false },
    { id: '504', name: 'KYC Compliance Costs', type: 'Expenses', isGroup: false },
];


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} size="lg">
            {pending ? 'Recording...' : <><Save className="mr-2 h-4 w-4" />Record Entry</>}
        </Button>
    );
}


export function JournalEntryForm() {
    const { toast } = useToast();
    const [state, formAction] = useFormState<FormState, FormData>(createJournalEntry, undefined);
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    
    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({ variant: 'destructive', title: 'Error Recording Entry', description: state.message });
        }
    }, [state, toast]);


  return (
    <form action={formAction} className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Journal Entry Details</CardTitle>
                <CardDescription>All fields are required for a valid double-entry transaction.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                 <div className="grid md:grid-cols-2 gap-6">
                     <div className="space-y-2">
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
                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Input id="description" name="description" placeholder="e.g., Client deposit for USDT" aria-describedby="description-error" />
                        {state?.errors?.description && <p id="description-error" className="text-sm text-destructive">{state.errors.description[0]}</p>}
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Debit Account (Increase Assets / Expenses)</Label>
                        <AccountCombobox name="debit_account" accounts={initialAccounts} />
                        {state?.errors?.debit_account && <p className="text-sm text-destructive">{state.errors.debit_account[0]}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label>Credit Account (Increase Liab. / Equity / Inc.)</Label>
                        <AccountCombobox name="credit_account" accounts={initialAccounts} />
                        {state?.errors?.credit_account && <p className="text-sm text-destructive">{state.errors.credit_account[0]}</p>}
                    </div>
                </div>

                 <div className="grid md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <Input id="amount" name="amount" type="number" step="any" placeholder="e.g., 1000.00" aria-describedby="amount-error"/>
                        {state?.errors?.amount && <p id="amount-error" className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Currency</Label>
                        <Select name="currency" defaultValue="USD">
                            <SelectTrigger aria-describedby="currency-error"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="YER">YER</SelectItem>
                                <SelectItem value="SAR">SAR</SelectItem>
                                <SelectItem value="USDT">USDT</SelectItem>
                            </SelectContent>
                        </Select>
                        {state?.errors?.currency && <p id="currency-error" className="text-sm text-destructive">{state.errors.currency[0]}</p>}
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

function AccountCombobox({ name, accounts }: { name: string, accounts: Account[] }) {
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
            : "Select an account..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search accounts..." />
          <CommandList>
            <CommandEmpty>No account found.</CommandEmpty>
            <CommandGroup>
                {accounts.map((acc) => (
                <CommandItem
                    key={acc.id}
                    value={`${acc.id} ${acc.name}`}
                    onSelect={() => {
                    setValue(acc.id)
                    setOpen(false)
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
                        <span className="text-muted-foreground">{acc.id}</span>
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
