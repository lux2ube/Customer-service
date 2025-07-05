
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
import type { Client, Account, Transaction, Settings } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
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

const initialFormData: Transaction = {
    id: '',
    date: new Date().toISOString(),
    type: 'Deposit',
    clientId: '',
    bankAccountId: '',
    cryptoWalletId: '',
    currency: 'USD',
    amount: 0,
    amount_usd: 0,
    fee_usd: 0,
    expense_usd: 0,
    amount_usdt: 0,
    notes: '',
    remittance_number: '',
    hash: '',
    client_wallet_address: '',
    status: 'Pending',
    flags: [],
    createdAt: '',
};

export function TransactionForm({ transaction, client }: { transaction?: Transaction, client?: Client | null }) {
    const { toast } = useToast();
    const action = transaction ? createTransaction.bind(null, transaction.id) : createTransaction.bind(null, null);
    const [state, formAction] = useActionState<TransactionFormState, FormData>(action, undefined);

    // Data state
    const [clients, setClients] = React.useState<Client[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    
    // Invoice generation state
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);
    const pristineRef = React.useRef(false);

    const [formData, setFormData] = React.useState<Transaction>(initialFormData);

    const getRate = React.useCallback((currency?: string) => {
        if (!currency || !settings) return 1;
        switch(currency) {
            case 'YER': return settings.yer_usd || 0;
            case 'SAR': return settings.sar_usd || 0;
            case 'USDT': return settings.usdt_usd || 1;
            case 'USD': default: return 1;
        }
    }, [settings]);

    // Effect for fetching supporting data from Firebase
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
        const unsubSettings = onValue(settingsRef, (snap) => setSettings(snap.val() || null));
        
        Promise.all([ get(clientsRef), get(accountsRef), get(settingsRef) ]).then(() => {
            setIsDataLoading(false);
        });

        return () => { unsubClients(); unsubAccounts(); unsubSettings(); };
    }, []);

    // Effect to set initial form data and auto-select favorite account
    React.useEffect(() => {
        if (isDataLoading) {
            return; // Wait for data to load
        }

        if (transaction) {
            // A "pristine" sync is one from bscscan that has not yet had a local amount saved.
            const isPristineSync = transaction.hash && transaction.amount === 0;
            pristineRef.current = isPristineSync;
            const initialData = { ...transaction };
            
            if (isPristineSync && client?.favoriteBankAccountId) {
                const favAccount = bankAccounts.find(acc => acc.id === client.favoriteBankAccountId);
                if (favAccount) {
                    initialData.bankAccountId = favAccount.id;
                    initialData.currency = favAccount.currency || 'USD';
                }
            }
            setFormData(initialData);
        } else {
            // This is a new transaction.
            setFormData(initialFormData);
        }
    }, [transaction, client, bankAccounts, isDataLoading]);
    
    // Server action response handler
    React.useEffect(() => {
        if (state?.message) {
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: state.message });
        }
    }, [state, toast]);
    
    const getNumberValue = (value: string | number) => {
        const num = parseFloat(String(value));
        return isNaN(num) ? 0 : num;
    }

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAmountNum = getNumberValue(e.target.value);

        setFormData(prev => {
            if (!settings || !prev.currency) return { ...prev, amount: newAmountNum };

            const rate = getRate(prev.currency);
            if (rate <= 0) return { ...prev, amount: newAmountNum };
            
            const newAmountUSD = newAmountNum * rate;

            // For synced tx, fee/expense is the difference
            if (prev.hash) {
                const difference = newAmountUSD - prev.amount_usdt;
                let newFeeUSD = 0;
                let newExpenseUSD = 0;

                if (difference >= 0) {
                    newFeeUSD = difference;
                } else {
                    newExpenseUSD = -difference; // expense is the absolute value
                }
                
                return {
                    ...prev,
                    amount: newAmountNum,
                    amount_usd: parseFloat(newAmountUSD.toFixed(2)),
                    fee_usd: parseFloat(newFeeUSD.toFixed(2)),
                    expense_usd: parseFloat(newExpenseUSD.toFixed(2)),
                };
            }
            
            // For manual transactions, calculate based on fee percentage
            const feePercent = prev.type === 'Deposit' ? settings.deposit_fee_percent : settings.withdraw_fee_percent;
            const calculatedFee = newAmountUSD * (feePercent / 100);
            const finalFee = Math.max(calculatedFee, settings.minimum_fee_usd || 0);

            const newUsdtAmount = prev.type === 'Deposit' ? newAmountUSD - finalFee : newAmountUSD + finalFee;

            return {
                ...prev,
                amount: newAmountNum,
                amount_usd: parseFloat(newAmountUSD.toFixed(2)),
                fee_usd: parseFloat(finalFee.toFixed(2)),
                expense_usd: 0, // Manual entries don't have expense
                amount_usdt: parseFloat(newUsdtAmount.toFixed(2)),
            };
        });
    };
    
    const handleBankAccountSelect = (accountId: string) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (!selectedAccount) return;
    
        setFormData(prev => ({
            ...prev,
            bankAccountId: accountId,
            currency: selectedAccount.currency || 'USD',
        }));
    };
    
    const handleFieldChange = (field: keyof Omit<Transaction, 'amount'>, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
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

    const isSynced = !!formData.hash;
    const amountToDisplay = pristineRef.current ? '' : (formData.amount || '');
    
    return (
        <>
            {transaction && client && (
                <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1, fontFamily: 'sans-serif' }}>
                    <div className="w-[420px]">
                        <Invoice ref={invoiceRef} transaction={{...formData, date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString() }} client={client} />
                    </div>
                </div>
            )}

            <form action={formAction} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="date">Date and Time</Label>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !formData.date && "text-muted-foreground")}>
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {formData.date ? format(new Date(formData.date), "PPP") : <span>Pick a date</span>}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={new Date(formData.date)} onSelect={(d) => handleFieldChange('date', d?.toISOString())} initialFocus /></PopoverContent>
                                    </Popover>
                                    <input type="hidden" name="date" value={formData.date ? new Date(formData.date).toISOString() : new Date().toISOString()} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Transaction Type</Label>
                                    <Select name="type" required value={formData.type} onValueChange={(v) => handleFieldChange('type', v)}>
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
                                    onSelect={(v) => handleFieldChange('clientId', v)}
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
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Financial Details</CardTitle>
                            <CardDescription>
                                {isSynced 
                                ? "This was synced from BscScan. Please enter the local currency Amount." 
                                : "Enter the local currency Amount to auto-calculate all other financial details."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount ({formData.currency})</Label>
                                <Input id="amount" name="amount" type="number" step="any" required value={amountToDisplay} onChange={handleAmountChange}/>
                                <input type="hidden" name="currency" value={formData.currency} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount_usd">Amount (USD)</Label>
                                <Input id="amount_usd" name="amount_usd" type="number" step="any" required value={formData.amount_usd} readOnly />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="fee_usd">Fee (USD)</Label>
                                <Input id="fee_usd" name="fee_usd" type="number" step="any" required value={formData.fee_usd} readOnly/>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="expense_usd">Expense / Loss (USD)</Label>
                                <Input id="expense_usd" name="expense_usd" type="number" step="any" value={formData.expense_usd || 0} readOnly/>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                                <Label htmlFor="amount_usdt">Final USDT Amount</Label>
                                <Input id="amount_usdt" name="amount_usdt" type="number" step="any" required value={formData.amount_usdt} readOnly/>
                            </div>
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
                                <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." value={formData.notes || ''} onChange={(e) => handleFieldChange('notes', e.target.value)}/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="attachment_url">Upload Transaction Image</Label>
                                <Input id="attachment_url" name="attachment_url" type="file" />
                                {transaction?.attachment_url && <a href={transaction.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View current attachment</a>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="remittance_number">Remittance Number</Label>
                                    <Input id="remittance_number" name="remittance_number" value={formData.remittance_number || ''} onChange={(e) => handleFieldChange('remittance_number', e.target.value)}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hash">Crypto Hash</Label>
                                    <Input id="hash" name="hash" value={formData.hash || ''} readOnly />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client_wallet_address">Client Wallet Address</Label>
                                <Input id="client_wallet_address" name="client_wallet_address" value={formData.client_wallet_address || ''} onChange={(e) => handleFieldChange('client_wallet_address', e.target.value)}/>
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
                                    <Select name="flags" value={formData.flags?.[0] || 'none'} onValueChange={(v) => handleFieldChange('flags', v === 'none' ? [] : (v ? [v] : []))}>
                                        <SelectTrigger><SelectValue placeholder="Add a flag..."/></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
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
