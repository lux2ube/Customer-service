'use client';

import type { Client, BankAccount, CryptoWallet } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, UploadCloud, X, Check, ChevronsUpDown } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveTransaction, type FormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from './ui/command';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { Separator } from './ui/separator';

interface TransactionFormProps {
  clients: Client[];
  bankAccounts: BankAccount[];
  cryptoWallets: CryptoWallet[];
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} size="lg" className="w-full">
            {pending ? 'Creating...' : <><Save className="mr-2 h-4 w-4" />Create Transaction</>}
        </Button>
    );
}

// Mock exchange rates and fees as per the plan. These would come from Settings in a real app.
const MOCK_EXCHANGE_RATES = { 'YER_USD': 0.0040, 'SAR_USD': 0.27 };
const MOCK_FEES = { 'Deposit': 0.01, 'Withdraw': 0.015 }; // 1% and 1.5%

export function TransactionForm({ clients, bankAccounts, cryptoWallets }: TransactionFormProps) {
    const { toast } = useToast();
    const [state, formAction] = useFormState<FormState, FormData>(saveTransaction, undefined);
    
    // State for interactive form elements
    const [date, setDate] = React.useState<Date | undefined>(new Date());
    const [amount, setAmount] = React.useState('');
    const [selectedBankAccount, setSelectedBankAccount] = React.useState<BankAccount | undefined>();
    const [usdtAmount, setUsdtAmount] = React.useState('');
    const [transactionType, setTransactionType] = React.useState<'Deposit' | 'Withdraw'>('Deposit');
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);

    const currency = selectedBankAccount?.currency || '';
    
    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({ variant: 'destructive', title: 'Error Saving Transaction', description: state.message });
        }
    }, [state, toast]);

    React.useEffect(() => {
        if (amount && selectedBankAccount) {
            const numAmount = parseFloat(amount);
            if (isNaN(numAmount)) return;

            let amountInUSD;
            if (currency === 'USD') {
                amountInUSD = numAmount;
            } else if (currency === 'YER') {
                amountInUSD = numAmount * MOCK_EXCHANGE_RATES.YER_USD;
            } else if (currency === 'SAR') {
                amountInUSD = numAmount * MOCK_EXCHANGE_RATES.SAR_USD;
            }

            if(amountInUSD !== undefined) {
                const fee = amountInUSD * MOCK_FEES[transactionType];
                const finalUsdtAmount = amountInUSD - fee;
                setUsdtAmount(finalUsdtAmount.toFixed(2));
            }
        } else {
            setUsdtAmount('');
        }
    }, [amount, selectedBankAccount, transactionType, currency]);
    
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => { setImagePreview(reader.result as string); };
            reader.readAsDataURL(file);
        } else {
            setImagePreview(null);
        }
    };
    
    const handleBankAccountSelect = (id: string) => {
        const bank = bankAccounts.find(b => b.id === id);
        setSelectedBankAccount(bank);
    };

    const paymentPreview = React.useMemo(() => {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount) || !selectedBankAccount) return null;

        let amountInUSD;
        if (currency === 'USD') amountInUSD = numAmount;
        else if (currency === 'YER') amountInUSD = numAmount * MOCK_EXCHANGE_RATES.YER_USD;
        else if (currency === 'SAR') amountInUSD = numAmount * MOCK_EXCHANGE_RATES.SAR_USD;
        else return null;
        
        const fee = amountInUSD * MOCK_FEES[transactionType];

        return {
            amountInUSD: amountInUSD.toFixed(2),
            fee: fee.toFixed(2),
            finalUsdt: usdtAmount
        };
    }, [amount, selectedBankAccount, currency, transactionType, usdtAmount]);

  return (
    <form action={formAction} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Required Data</CardTitle>
                        <CardDescription>Fill in the core details of the transaction.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="date">Date and Time</Label>
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
                                <input type="hidden" name="transactionDate" value={date?.toISOString()} />
                            </div>
                            <div className="space-y-2">
                                <Label>Transaction Type</Label>
                                <RadioGroup name="type" defaultValue={transactionType} onValueChange={(v) => setTransactionType(v as 'Deposit' | 'Withdraw')} className="flex gap-4 pt-2">
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Deposit" id="deposit" /><Label htmlFor="deposit" className="font-normal">Deposit</Label></div>
                                    <div className="flex items-center space-x-2"><RadioGroupItem value="Withdraw" id="withdraw" /><Label htmlFor="withdraw" className="font-normal">Withdraw</Label></div>
                                </RadioGroup>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="clientId">Client</Label>
                            <ClientCombobox clients={clients} />
                            {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                        </div>
                        
                        <div className="space-y-2">
                           <Label>Bank Account</Label>
                           <Select name="bankAccountId" onValueChange={handleBankAccountSelect}>
                                <SelectTrigger><SelectValue placeholder="Select a bank account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.name} ({b.currency})</SelectItem>)}
                                </SelectContent>
                           </Select>
                           {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
                        </div>
                        
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount {currency && `(in ${currency})`}</Label>
                                <Input id="amount" name="amount" type="number" step="0.01" placeholder="e.g., 1000.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                                 {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Crypto Wallet</Label>
                                <Select name="cryptoWalletId">
                                    <SelectTrigger><SelectValue placeholder="Select a USDT wallet..." /></SelectTrigger>
                                    <SelectContent>
                                        {cryptoWallets.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        
                        <div>
                             <Label>Transaction Image</Label>
                             {imagePreview ? (
                                <div className="relative group mt-2">
                                    <img src={imagePreview} alt="Transaction Preview" className="w-full h-auto max-h-40 object-contain rounded-md border bg-muted" />
                                    <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => { setImagePreview(null); const input = document.getElementById('tx-image') as HTMLInputElement; if (input) input.value = ''; }}><X className="h-4 w-4" /></Button>
                                </div>
                            ) : (
                                <div className="mt-2 space-y-2">
                                    <Label htmlFor="tx-image" className="cursor-pointer">
                                        <div className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg hover:bg-secondary transition-colors">
                                            <UploadCloud className="w-6 h-6 text-muted-foreground" />
                                            <p className="mt-1 text-sm text-muted-foreground">Click to upload</p>
                                        </div>
                                    </Label>
                                    <Input id="tx-image" name="transactionImage" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg"/>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Optional Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="remittanceNumber">Remittance Number</Label>
                                <Input id="remittanceNumber" name="remittanceNumber" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="cryptoHash">Crypto Transaction Hash</Label>
                                <Input id="cryptoHash" name="cryptoHash" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="clientWalletAddress">Wallet Address of Client</Label>
                            <Input id="clientWalletAddress" name="clientWalletAddress" />
                        </div>
                        <Separator />
                        <div className="space-y-2">
                            <Label>Need Flag Review</Label>
                            <div className="flex items-center space-x-2"><Checkbox id="flag-aml" name="flagAml" /><Label htmlFor="flag-aml" className="font-normal">AML</Label></div>
                            <div className="flex items-center space-x-2"><Checkbox id="flag-kyc" name="flagKyc" /><Label htmlFor="flag-kyc" className="font-normal">KYC</Label></div>
                            <div className="flex items-center space-x-2"><Checkbox id="flag-other" name="flagOther" /><Label htmlFor="flag-other" className="font-normal">Other</Label></div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            
            <div className="lg:col-span-1 space-y-6">
                 <Card className="sticky top-20">
                    <CardHeader>
                        <CardTitle>Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select name="status" defaultValue="Pending">
                                <SelectTrigger id="status"><SelectValue placeholder="Select a status" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            {state?.errors?.status && <p className="text-sm text-destructive">{state.errors.status[0]}</p>}
                        </div>
                        <Separator />
                        <h3 className="text-lg font-semibold tracking-tight">Payment Preview</h3>
                        {paymentPreview ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span>Amount in USD:</span> <span>${paymentPreview.amountInUSD}</span></div>
                            <div className="flex justify-between"><span>Fee ({MOCK_FEES[transactionType]*100}%):</span> <span className="text-destructive">-${paymentPreview.fee}</span></div>
                            <Separator />
                            <div className="flex justify-between items-center font-medium">
                                <Label htmlFor="usdtAmount" className="text-base">Amount in USDT:</Label>
                                <Input id="usdtAmount" name="usdtAmount" value={usdtAmount} onChange={(e) => setUsdtAmount(e.target.value)} className="w-32 h-8 text-right font-semibold text-base"/>
                            </div>
                        </div>
                        ) : (
                           <p className="text-sm text-muted-foreground">Enter an amount and select a bank to see a preview.</p>
                        )}
                    </CardContent>
                    <CardFooter>
                         <SubmitButton />
                    </CardFooter>
                </Card>
            </div>
        </div>
    </form>
  );
}

function ClientCombobox({ clients }: { clients: Client[] }) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")

  return (
    <>
    <input type="hidden" name="clientId" value={value} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value
            ? clients.find((client) => client.id === value)?.name
            : "Select a client..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search client by name or phone..." />
          <CommandEmpty>No client found.</CommandEmpty>
          <CommandGroup>
            {clients.map((client) => (
              <CommandItem
                key={client.id}
                value={`${client.name} ${client.phone}`}
                onSelect={() => {
                  setValue(client.id)
                  setOpen(false)
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === client.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <div>
                    <div>{client.name}</div>
                    <div className="text-xs text-muted-foreground">{client.phone}</div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
    </>
  )
}
