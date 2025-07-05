
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Check, ChevronsUpDown, Download, Loader2, Share2 } from 'lucide-react';
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
import { Invoice } from '@/components/invoice';
import html2canvas from 'html2canvas';

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
    
    // Form state
    const [date, setDate] = React.useState<Date | undefined>(transaction ? new Date(transaction.date) : new Date());
    const [clients, setClients] = React.useState<Client[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);

    // Controlled state for inputs and comboboxes
    const [amount, setAmount] = React.useState(transaction?.amount || 0);
    const [currency, setCurrency] = React.useState(transaction?.currency || 'USD');
    const [transactionType, setTransactionType] = React.useState<'Deposit' | 'Withdraw'>(transaction?.type || 'Deposit');
    const [selectedClientId, setSelectedClientId] = React.useState(transaction?.clientId);
    const [selectedBankAccountId, setSelectedBankAccountId] = React.useState(transaction?.bankAccountId);
    
    // Calculated values for the preview
    const [usdValue, setUsdValue] = React.useState(transaction?.amount_usd || 0);
    const [fee, setFee] = React.useState(transaction?.fee_usd || 0);
    const [expense, setExpense] = React.useState(transaction?.expense_usd || 0);
    const [usdtAmount, setUsdtAmount] = React.useState(transaction?.amount_usdt || 0);
    const [lastEditedField, setLastEditedField] = React.useState<'amount' | 'usdt' | null>(null);
    const [isInitialLoad, setIsInitialLoad] = React.useState(true);


    // Invoice generation state
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);

    // Effect for fetching data from Firebase (runs once on mount)
    React.useEffect(() => {
        const clientsRef = ref(db, 'clients');
        const unsubscribeClients = onValue(clientsRef, (snapshot) => {
             const data = snapshot.val();
             const clientList: Client[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
             setClients(clientList);
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

    // Effect for performing financial calculations
    React.useEffect(() => {
        // Don't run on initial load for synced transactions; a separate effect handles that.
        if (isInitialLoad && transaction?.hash) {
            // Once the initial load effect runs, it will set isInitialLoad to false,
            // allowing this effect to take over for user edits.
            return;
        }

        if (!settings) return;

        const isSyncedTransaction = !!transaction?.hash;

        const getRate = (curr: string) => {
            switch(curr) {
                case 'USD': return 1;
                case 'USDT': return settings.usdt_usd || 1;
                case 'YER': return settings.yer_usd || 0;
                case 'SAR': return settings.sar_usd || 0;
                default: return 0;
            }
        };

        const rate = getRate(currency);
        if (rate === 0) return;

        const minimumFee = settings.minimum_fee_usd || 1;
        const depositFeePercent = (settings.deposit_fee_percent || 0) / 100;
        const withdrawFeePercent = (settings.withdraw_fee_percent || 0) / 100;
        
        let finalUsd = 0;
        let finalFee = 0;
        let finalExpense = 0;

        if (isSyncedTransaction) {
            // --- SYNCED TRANSACTION LOGIC ---
            if (lastEditedField === 'amount') {
                finalUsd = amount * rate;
                const difference = (transactionType === 'Deposit') ? finalUsd - usdtAmount : usdtAmount - finalUsd;
                if (difference >= 0) { finalFee = difference; finalExpense = 0; }
                else { finalFee = 0; finalExpense = -difference; }
            } else { // lastEditedField === 'usdt'
                let derivedUsd = 0;
                if (transactionType === 'Deposit') {
                    const usdFromFeePercent = usdtAmount / (1 - depositFeePercent);
                    derivedUsd = (usdFromFeePercent * depositFeePercent) > minimumFee ? usdFromFeePercent : usdtAmount + minimumFee;
                } else { // Withdraw
                    const usdFromFeePercent = usdtAmount / (1 + withdrawFeePercent);
                    derivedUsd = (usdFromFeePercent * withdrawFeePercent) > minimumFee ? usdFromFeePercent : usdtAmount - minimumFee;
                }
                const newAmount = derivedUsd / rate;
                setAmount(Number(newAmount.toFixed(2)));
                finalUsd = derivedUsd;
                
                const difference = (transactionType === 'Deposit') ? finalUsd - usdtAmount : usdtAmount - finalUsd;
                if (difference >= 0) { finalFee = difference; finalExpense = 0;} 
                else { finalFee = 0; finalExpense = -difference; }
            }
        } else {
            // --- MANUAL TRANSACTION LOGIC ---
            if (lastEditedField === 'amount') {
                finalUsd = amount * rate;
                const percentageFee = (transactionType === 'Deposit') ? finalUsd * depositFeePercent : finalUsd * withdrawFeePercent;
                finalFee = Math.max(percentageFee, minimumFee);
                finalExpense = 0;
                
                const finalUsdt = (transactionType === 'Deposit') ? finalUsd - finalFee : finalUsd + finalFee;
                setUsdtAmount(Number(finalUsdt.toFixed(2)));
            } else { // lastEditedField === 'usdt'
                finalUsd = amount * rate;
                const difference = (transactionType === 'Deposit') ? finalUsd - usdtAmount : usdtAmount - finalUsd;
                if (difference >= 0) { finalFee = difference; finalExpense = 0; }
                else { finalFee = 0; finalExpense = -difference; }
            }
        }

        setUsdValue(finalUsd);
        setFee(finalFee);
        setExpense(finalExpense);

    }, [amount, usdtAmount, currency, transactionType, settings, lastEditedField, transaction, isInitialLoad]);

    // Effect for the initial setup of synced transactions
    React.useEffect(() => {
        if (!isInitialLoad || !transaction?.hash || !settings || clients.length === 0 || bankAccounts.length === 0) {
            return;
        }

        // --- Start of auto-selection and calculation logic ---
        const client = clients.find(c => c.id === transaction.clientId);
        const favoriteAccountId = client?.favoriteBankAccountId;
        const accountIdToUse = transaction.bankAccountId || favoriteAccountId;

        if (accountIdToUse) {
            const account = bankAccounts.find(a => a.id === accountIdToUse);
            if (account && account.currency) {
                // Set form state based on found account
                if (selectedBankAccountId !== account.id) setSelectedBankAccountId(account.id);
                if (currency !== account.currency) setCurrency(account.currency);

                // Perform the initial reverse calculation
                const rate = (() => {
                    switch(account.currency) {
                        case 'USD': return 1;
                        case 'USDT': return settings.usdt_usd || 1;
                        case 'YER': return settings.yer_usd || 0;
                        case 'SAR': return settings.sar_usd || 0;
                        default: return 0;
                    }
                })();

                if (rate > 0) {
                    const minimumFee = settings.minimum_fee_usd || 1;
                    const depositFeePercent = (settings.deposit_fee_percent || 0) / 100;
                    const withdrawFeePercent = (settings.withdraw_fee_percent || 0) / 100;
                    let derivedUsd = 0;

                    if (transaction.type === 'Deposit') {
                        const usdFromFeePercent = usdtAmount / (1 - depositFeePercent);
                        derivedUsd = (usdFromFeePercent * depositFeePercent) > minimumFee ? usdFromFeePercent : usdtAmount + minimumFee;
                    } else { // Withdraw
                        const usdFromFeePercent = usdtAmount / (1 + withdrawFeePercent);
                        derivedUsd = (usdFromFeePercent * withdrawFeePercent) > minimumFee ? usdFromFeePercent : usdtAmount - minimumFee;
                    }
                    
                    const newAmount = derivedUsd / rate;
                    setAmount(Number(newAmount.toFixed(2)));
                    setUsdValue(derivedUsd);
                    const difference = (transaction.type === 'Deposit') ? derivedUsd - usdtAmount : usdtAmount - derivedUsd;
                    if (difference >= 0) { setFee(difference); setExpense(0); }
                    else { setFee(0); setExpense(-difference); }
                }
            }
        }
        setIsInitialLoad(false); // Mark initial load as complete
    }, [isInitialLoad, transaction, settings, clients, bankAccounts]);


    // Effect for handling server action responses
    React.useEffect(() => {
        if (state?.message) {
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: state.message });
        }
    }, [state, toast]);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setAmount(Number(e.target.value));
        setLastEditedField('amount');
    }

    const handleTypeChange = (v: 'Deposit' | 'Withdraw') => {
        setTransactionType(v);
        setLastEditedField('amount');
    }
    
    const handleUsdtAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setUsdtAmount(Number(e.target.value));
        setLastEditedField('usdt');
    }

    const handleClientSelect = (clientId: string) => {
        setSelectedClientId(clientId);
        const selectedClient = clients.find(c => c.id === clientId);

        if (selectedClient?.favoriteBankAccountId) {
            const favoriteAccount = bankAccounts.find(ba => ba.id === selectedClient.favoriteBankAccountId);
            if (favoriteAccount) {
                setSelectedBankAccountId(favoriteAccount.id);
                if (favoriteAccount.currency) {
                    setCurrency(favoriteAccount.currency);
                }
            }
        } else {
            setSelectedBankAccountId(undefined);
        }
        
        setLastEditedField('amount');
    };
    
    const handleBankAccountSelect = (accountId: string) => {
        setSelectedBankAccountId(accountId);
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (selectedAccount && selectedAccount.currency) {
            setCurrency(selectedAccount.currency);
            if (transaction?.hash) {
                setLastEditedField('usdt');
            } else {
                setLastEditedField('amount');
            }
        }
    };

    const handleDownloadInvoice = async () => {
        if (!invoiceRef.current || !transaction) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, { 
                scale: 2,
                useCORS: true, 
                backgroundColor: null,
            });
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `invoice-${transaction.id.slice(-8).toUpperCase()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error("Error generating invoice image:", error);
            toast({
                variant: "destructive",
                title: "Download Failed",
                description: "Could not generate invoice image. See console for details.",
            });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShareInvoice = async () => {
        if (!invoiceRef.current || !transaction || !client) return;
        setIsSharing(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, {
                scale: 2,
                useCORS: true,
                backgroundColor: null,
            });

            if (navigator.share) {
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        toast({ variant: "destructive", title: "Share Failed", description: "Could not create image blob." });
                        setIsSharing(false);
                        return;
                    }
                    const file = new File([blob], `invoice-${transaction.id.slice(-8).toUpperCase()}.png`, { type: 'image/png' });
                    try {
                        await navigator.share({
                            files: [file],
                            title: `Invoice for ${client.name}`,
                            text: `Here is the invoice for transaction ${transaction.id}.`,
                        });
                    } catch (error) {
                        console.log("Sharing cancelled or failed", error);
                    } finally {
                        setIsSharing(false);
                    }
                }, 'image/png');
            } else {
                toast({
                    variant: "destructive",
                    title: "Share Not Supported",
                    description: "Your browser does not support this feature. Please download the image and share it manually.",
                });
                setIsSharing(false);
            }
        } catch (error) {
            console.error("Error generating invoice for sharing:", error);
            toast({ variant: "destructive", title: "Share Failed", description: "Could not generate invoice image." });
            setIsSharing(false);
        }
    };

    return (
        <>
            {transaction && client && (
                <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1, fontFamily: 'sans-serif' }}>
                    <div className="w-[420px]">
                        <Invoice ref={invoiceRef} transaction={transaction} client={client} />
                    </div>
                </div>
            )}

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
                                <DataCombobox 
                                    name="clientId" 
                                    data={clients.map(c => ({id: c.id, name: `${c.name} (${c.phone})`}))} 
                                    placeholder="Search by name or phone..." 
                                    value={selectedClientId} 
                                    onSelect={handleClientSelect} 
                                />
                                {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                <Label>Bank Account</Label>
                                    <DataCombobox 
                                        name="bankAccountId" 
                                        data={bankAccounts.map(b => ({id: b.id, name: `${b.name} (${b.currency})`}))} 
                                        placeholder="Select a bank account..." 
                                        value={selectedBankAccountId} 
                                        onSelect={handleBankAccountSelect}
                                    />
                                </div>
                                <div className="space-y-2">
                                <Label>Crypto Wallet</Label>
                                    <DataCombobox name="cryptoWalletId" data={cryptoWallets.map(w => ({id: w.id, name: `${w.name} (${w.id})`}))} placeholder="Select a crypto wallet..." value={transaction?.cryptoWalletId}/>
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
                            <input type="hidden" name="currency" value={currency} />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment Preview</CardTitle>
                            <CardDescription>Values are calculated automatically based on your interaction.</CardDescription>
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
                        <Card>
                            <CardHeader>
                                <CardTitle>Actions</CardTitle>
                                <CardDescription>Download or share the invoice.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                 <Button onClick={handleDownloadInvoice} disabled={isDownloading || isSharing} className="w-full">
                                    {isDownloading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Download className="mr-2 h-4 w-4" />
                                    )}
                                    {isDownloading ? 'Downloading...' : 'Download Invoice'}
                                </Button>
                                <Button onClick={handleShareInvoice} disabled={isSharing || isDownloading} className="w-full">
                                    {isSharing ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Share2 className="mr-2 h-4 w-4" />
                                    )}
                                    {isSharing ? 'Preparing...' : 'Share Invoice'}
                                </Button>
                            </CardContent>
                        </Card>
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
        </>
    );
}

function DataCombobox({ name, data, placeholder, value, onSelect }: { name: string, data: {id: string, name: string}[], placeholder: string, value?: string, onSelect?: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(value);

  React.useEffect(() => {
    setInternalValue(value);
  }, [value]);
  
  const handleSelect = (currentValue: string) => {
    setInternalValue(currentValue);
    onSelect?.(currentValue);
    setOpen(false);
  };

  return (
    <>
    <input type="hidden" name={name} value={internalValue || ""} />
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {internalValue ? data.find((d) => d.id === internalValue)?.name : placeholder}
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
                    onSelect={() => handleSelect(d.id)}>
                    <Check className={cn("mr-2 h-4 w-4", internalValue === d.id ? "opacity-100" : "opacity-0")}/>
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
