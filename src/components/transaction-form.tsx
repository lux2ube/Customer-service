
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
import { ref, onValue, get } from 'firebase/database';
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

    // Data state
    const [clients, setClients] = React.useState<Client[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    
    // Invoice generation state
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);
    
    // Form state - All fields are controlled now
    const [formData, setFormData] = React.useState({
        date: transaction ? new Date(transaction.date) : new Date(),
        type: transaction?.type || 'Deposit',
        clientId: transaction?.clientId,
        bankAccountId: transaction?.bankAccountId,
        cryptoWalletId: transaction?.cryptoWalletId,
        currency: transaction?.currency || 'USD',
        amount: transaction?.amount || 0,
        amount_usd: transaction?.amount_usd || 0,
        fee_usd: transaction?.fee_usd || 0,
        expense_usd: transaction?.expense_usd || 0,
        amount_usdt: transaction?.amount_usdt || 0,
        notes: transaction?.notes || '',
        remittance_number: transaction?.remittance_number || '',
        hash: transaction?.hash || '',
        client_wallet_address: transaction?.client_wallet_address || '',
        status: transaction?.status || 'Pending',
        flags: transaction?.flags || [],
    });

    // Effect for fetching supporting data from Firebase (runs once)
    React.useEffect(() => {
        const clientsRef = ref(db, 'clients');
        const accountsRef = ref(db, 'accounts');
        const settingsRef = ref(db, 'settings');

        const unsubClients = onValue(clientsRef, (snap) => setClients(snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : []));
        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'));
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });
        const unsubSettings = onValue(settingsRef, (snap) => setSettings(snap.val()));

        return () => {
            unsubClients();
            unsubAccounts();
            unsubSettings();
        };
    }, []);

    // Effect to reset form state when transaction prop changes (e.g., after save and redirect)
    React.useEffect(() => {
        if (transaction) {
            setFormData({
                date: new Date(transaction.date),
                type: transaction.type,
                clientId: transaction.clientId,
                bankAccountId: transaction.bankAccountId,
                cryptoWalletId: transaction.cryptoWalletId,
                currency: transaction.currency,
                amount: transaction.amount,
                amount_usd: transaction.amount_usd,
                fee_usd: transaction.fee_usd,
                expense_usd: transaction.expense_usd || 0,
                amount_usdt: transaction.amount_usdt,
                notes: transaction.notes || '',
                remittance_number: transaction.remittance_number || '',
                hash: transaction.hash || '',
                client_wallet_address: transaction.client_wallet_address || '',
                status: transaction.status,
                flags: transaction.flags || [],
            });
        }
    }, [transaction]);

    // Initial calculation for synced transactions
    React.useEffect(() => {
        if (transaction?.hash && bankAccounts.length > 0 && settings) {
             const accountIdToUse = transaction.bankAccountId || clients.find(c => c.id === transaction.clientId)?.favoriteBankAccountId;
             if (accountIdToUse) {
                const account = bankAccounts.find(a => a.id === accountIdToUse);
                if(account) {
                    calculateFromUsdt(transaction.amount_usdt, transaction.type, account.currency || 'USD');
                }
             }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transaction, bankAccounts, clients, settings]); // Runs when data is ready

    // Server action response handler
    React.useEffect(() => {
        if (state?.message) {
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: state.message });
        }
    }, [state, toast]);
    
    const getRate = React.useCallback((curr: string) => {
        if (!settings) return 1;
        return {
            'USD': 1,
            'USDT': settings.usdt_usd || 1,
            'YER': settings.yer_usd || 0,
            'SAR': settings.sar_usd || 0
        }[curr] || 0;
    }, [settings]);

    const calculateFromAmount = (newAmount: number, type: string, currency: string) => {
        if (!settings) return;
        const rate = getRate(currency);
        if (rate === 0) return;

        const newUsdValue = newAmount * rate;
        let newUsdtAmount = 0;
        let finalFee = 0;
        let finalExpense = 0;

        if (!transaction?.hash) { // Manual Transaction
            const minimumFee = settings.minimum_fee_usd || 1;
            const depositFeePercent = (settings.deposit_fee_percent || 0) / 100;
            const withdrawFeePercent = (settings.withdraw_fee_percent || 0) / 100;
            const percentageFee = type === 'Deposit' ? newUsdValue * depositFeePercent : newUsdValue * withdrawFeePercent;
            finalFee = Math.max(percentageFee, minimumFee);
            newUsdtAmount = type === 'Deposit' ? newUsdValue - finalFee : newUsdValue + finalFee;
        } else { // Synced Transaction
            newUsdtAmount = formData.amount_usdt; // Keep USDT fixed
            const difference = type === 'Deposit' ? newUsdValue - newUsdtAmount : newUsdtAmount - newUsdValue;
            if (difference >= 0) { finalFee = difference; } else { finalExpense = -difference; }
        }

        setFormData(prev => ({
            ...prev,
            amount: newAmount,
            amount_usd: newUsdValue,
            fee_usd: finalFee,
            expense_usd: finalExpense,
            amount_usdt: newUsdtAmount
        }));
    };

    const calculateFromUsdt = (newUsdtAmount: number, type: string, currency: string) => {
        if (!settings) return;
        const rate = getRate(currency);
        if (rate === 0) return;

        let newAmount = 0;
        let newUsdValue = 0;
        let finalFee = 0;
        let finalExpense = 0;

        if (transaction?.hash) { // Synced Transaction: Reverse calculate amount
            const minimumFee = settings.minimum_fee_usd || 1;
            const depositFeePercent = (settings.deposit_fee_percent || 0) / 100;
            const withdrawFeePercent = (settings.withdraw_fee_percent || 0) / 100;
            if (type === 'Deposit') {
                const usdFromFee = newUsdtAmount / (1 - depositFeePercent);
                newUsdValue = (usdFromFee * depositFeePercent) > minimumFee ? usdFromFee : newUsdtAmount + minimumFee;
            } else { // Withdraw
                const usdFromFee = newUsdtAmount / (1 + withdrawFeePercent);
                newUsdValue = (usdFromFee * withdrawFeePercent) > minimumFee ? usdFromFee : newUsdtAmount - minimumFee;
            }
            newAmount = newUsdValue / rate;
        } else { // Manual Transaction: USDT change affects fee/expense
            newUsdValue = formData.amount_usd;
            newAmount = formData.amount; // Keep amount fixed
        }

        const difference = type === 'Deposit' ? newUsdValue - newUsdtAmount : newUsdtAmount - newUsdValue;
        if (difference >= 0) { finalFee = difference; } else { finalExpense = -difference; }

        setFormData(prev => ({ ...prev, amount: newAmount, amount_usd: newUsdValue, fee_usd: finalFee, expense_usd: finalExpense, amount_usdt: newUsdtAmount }));
    };

    const handleFieldChange = (field: keyof typeof formData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAmount = Number(e.target.value);
        handleFieldChange('amount', newAmount);
        calculateFromAmount(newAmount, formData.type, formData.currency);
    };

    const handleUsdtAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUsdtAmount = Number(e.target.value);
        handleFieldChange('amount_usdt', newUsdtAmount);
        calculateFromUsdt(newUsdtAmount, formData.type, formData.currency);
    };
    
    const handleTypeChange = (newType: 'Deposit' | 'Withdraw') => {
        handleFieldChange('type', newType);
        // Recalculate based on amount, as it's the primary input
        calculateFromAmount(formData.amount, newType, formData.currency);
    };

    const handleBankAccountSelect = (accountId: string) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (selectedAccount) {
            const newCurrency = selectedAccount.currency || 'USD';
            handleFieldChange('bankAccountId', accountId);
            handleFieldChange('currency', newCurrency);
            // Recalculate based on the new currency
            calculateFromAmount(formData.amount, formData.type, newCurrency);
        }
    };
    
    const handleClientSelect = (clientId: string) => {
        handleFieldChange('clientId', clientId);
        const selectedClient = clients.find(c => c.id === clientId);
        const favoriteAccount = bankAccounts.find(ba => ba.id === selectedClient?.favoriteBankAccountId);
        if (favoriteAccount) {
            handleBankAccountSelect(favoriteAccount.id);
        }
    };


    const handleDownloadInvoice = async () => {
        if (!invoiceRef.current || !transaction) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: null });
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `invoice-${transaction.id.slice(-8).toUpperCase()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            toast({ variant: "destructive", title: "Download Failed", description: "Could not generate invoice image." });
        } finally {
            setIsDownloading(false);
        }
    };

    const handleShareInvoice = async () => {
        if (!invoiceRef.current || !transaction || !client) return;
        setIsSharing(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: null });
            if (navigator.share) {
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        toast({ variant: "destructive", title: "Share Failed", description: "Could not create image blob." });
                        setIsSharing(false);
                        return;
                    }
                    const file = new File([blob], `invoice-${transaction.id.slice(-8).toUpperCase()}.png`, { type: 'image/png' });
                    try {
                        await navigator.share({ files: [file], title: `Invoice for ${client.name}`, text: `Here is the invoice for transaction ${transaction.id}.` });
                    } catch (error) { console.log("Sharing cancelled or failed", error); } finally { setIsSharing(false); }
                }, 'image/png');
            } else {
                toast({ variant: "destructive", title: "Share Not Supported", description: "Your browser does not support this feature." });
                setIsSharing(false);
            }
        } catch (error) {
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
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.date && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {formData.date ? format(formData.date, "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formData.date} onSelect={(d) => handleFieldChange('date', d)} initialFocus /></PopoverContent>
                                    </Popover>
                                    <input type="hidden" name="date" value={formData.date?.toISOString()} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Transaction Type</Label>
                                    <Select name="type" required value={formData.type} onValueChange={handleTypeChange}>
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
                                    value={formData.clientId} 
                                    onSelect={handleClientSelect} 
                                />
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                <Label>Bank Account</Label>
                                    <DataCombobox 
                                        name="bankAccountId" 
                                        data={bankAccounts.map(b => ({id: b.id, name: `${b.name} (${b.currency})`}))} 
                                        placeholder="Select a bank account..." 
                                        value={formData.bankAccountId} 
                                        onSelect={handleBankAccountSelect}
                                    />
                                </div>
                                <div className="space-y-2">
                                <Label>Crypto Wallet</Label>
                                    <DataCombobox name="cryptoWalletId" data={cryptoWallets.map(w => ({id: w.id, name: `${w.name} (${w.id})`}))} placeholder="Select a crypto wallet..." value={formData.cryptoWalletId} onSelect={(v) => handleFieldChange('cryptoWalletId', v)}/>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount ({formData.currency})</Label>
                                    <Input id="amount" name="amount" type="number" step="any" placeholder="e.g., 1000.00" required value={formData.amount} onChange={handleAmountChange}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="attachment_url">Upload Transaction Image</Label>
                                    <Input id="attachment_url" name="attachment_url" type="file" />
                                </div>
                            </div>
                            <input type="hidden" name="currency" value={formData.currency} />
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
                                <span className="font-mono text-lg">${formData.amount_usd.toFixed(2)}</span>
                            </div>
                            <Separator />
                            <div className='flex justify-between items-center'>
                                <Label>Fee</Label>
                                <span className="font-mono text-lg">${formData.fee_usd.toFixed(2)}</span>
                            </div>
                            {formData.expense_usd > 0 && (
                                <>
                                    <Separator />
                                    <div className='flex justify-between items-center text-destructive'>
                                        <Label className="font-bold text-destructive">Expense / Loss</Label>
                                        <span className="font-mono text-lg font-bold">${formData.expense_usd.toFixed(2)}</span>
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
                                    value={formData.amount_usdt}
                                    onChange={handleUsdtAmountChange}
                                    className="w-48 text-right font-mono text-lg font-bold"
                                />
                            </div>
                            <input type="hidden" name="amount_usd" value={formData.amount_usd} />
                            <input type="hidden" name="fee_usd" value={formData.fee_usd} />
                            <input type="hidden" name="expense_usd" value={formData.expense_usd} />
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
                                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    {isDownloading ? 'Downloading...' : 'Download Invoice'}
                                </Button>
                                <Button onClick={handleShareInvoice} disabled={isSharing || isDownloading} className="w-full">
                                    {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
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
                                <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." value={formData.notes} onChange={(e) => handleFieldChange('notes', e.target.value)}/>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="remittance_number">Remittance Number</Label>
                                    <Input id="remittance_number" name="remittance_number" value={formData.remittance_number} onChange={(e) => handleFieldChange('remittance_number', e.target.value)}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hash">Crypto Hash</Label>
                                    <Input id="hash" name="hash" value={formData.hash} disabled />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client_wallet_address">Client Wallet Address</Label>
                                <Input id="client_wallet_address" name="client_wallet_address" value={formData.client_wallet_address} onChange={(e) => handleFieldChange('client_wallet_address', e.target.value)}/>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label>Status</Label>
                                    <Select name="status" value={formData.status} onValueChange={(v) => handleFieldChange('status', v as Transaction['status'])}>
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
                                    <Select name="flags" value={formData.flags?.[0]} onValueChange={(v) => handleFieldChange('flags', v ? [v] : [])}>
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

function DataCombobox({ name, data, placeholder, value, onSelect }: { name: string, data: {id: string, name: string}[], placeholder: string, value?: string | null, onSelect?: (value: string) => void }) {
  const [open, setOpen] = React.useState(false);
  
  const handleSelect = (currentValue: string) => {
    const finalValue = currentValue === value ? "" : currentValue;
    if (onSelect) {
      onSelect(finalValue);
    }
    setOpen(false);
  };

  return (
    <>
    <input type="hidden" name={name} value={value || ""} />
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
                    onSelect={() => handleSelect(d.id)}>
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
