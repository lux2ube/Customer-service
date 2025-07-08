
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Check, ChevronsUpDown, Download, Loader2, Share2, MessageSquare } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createTransaction, type TransactionFormState, matchSmsTransaction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn, normalizeArabic } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Transaction, Settings, SmsTransaction } from '@/lib/types';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { Invoice } from '@/components/invoice';
import html2canvas from 'html2canvas';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} size="sm" className="w-full">
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
    linkedSmsId: '',
};

function BankAccountSelector({
  accounts,
  value,
  onSelect,
}: {
  accounts: Account[];
  value: string | null | undefined;
  onSelect: (accountId: string) => void;
}) {
  const [showAll, setShowAll] = React.useState(false);

  // Sort accounts by priority, then by name as a fallback.
  const sortedAccounts = React.useMemo(() => {
    return [...accounts].sort((a, b) => {
        const priorityA = a.priority ?? Infinity;
        const priorityB = b.priority ?? Infinity;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return a.name.localeCompare(b.name);
    });
  }, [accounts]);

  const visibleAccounts = showAll ? sortedAccounts : sortedAccounts.slice(0, 3);

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {visibleAccounts.map((account) => (
        <Button
          key={account.id}
          type="button"
          variant={value === account.id ? 'default' : 'outline'}
          size="xs"
          onClick={() => onSelect(account.id)}
          className="flex-none"
        >
          {account.name}
        </Button>
      ))}
      {!showAll && sortedAccounts.length > 3 && (
        <Button
          key="show-more"
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setShowAll(true)}
          className="text-muted-foreground flex-none"
        >
          Show More...
        </Button>
      )}
    </div>
  );
}

export function TransactionForm({ transaction, client, clients = [] }: { transaction?: Transaction, client?: Client | null, clients: Client[] }) {
    const { toast } = useToast();
    const action = transaction ? createTransaction.bind(null, transaction.id) : createTransaction.bind(null, null);
    const [state, formAction] = useActionState<TransactionFormState, FormData>(action, undefined);

    // Data state
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    
    // Suggestion State
    const [suggestedSms, setSuggestedSms] = React.useState<SmsTransaction[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = React.useState(false);
    
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
        const accountsRef = ref(db, 'accounts');
        const settingsRef = ref(db, 'settings');

        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'));
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });
        const unsubSettings = onValue(settingsRef, (snap) => setSettings(snap.val() || null));
        
        Promise.all([ get(accountsRef), get(settingsRef) ]).then(() => {
            setIsDataLoading(false);
        });

        return () => { unsubAccounts(); unsubSettings(); };
    }, []);

    // Effect to set initial form data when editing a transaction
    React.useEffect(() => {
        if (transaction && !isDataLoading) {
            const formState = { ...initialFormData, ...transaction };
            
            if (client?.favoriteBankAccountId && !formState.bankAccountId) {
                const favoriteAccount = bankAccounts.find(acc => acc.id === client.favoriteBankAccountId);
                if (favoriteAccount) {
                    formState.bankAccountId = favoriteAccount.id;
                    formState.currency = favoriteAccount.currency || 'USD';
                }
            }

            setFormData(formState);
        }
    }, [transaction, client, isDataLoading, bankAccounts]);

    React.useEffect(() => {
        if (isDataLoading) return;

        const isSynced = !!formData.hash;
        if (isSynced) {
            const isPristineSync = isSynced && !transaction?.amount;
             pristineRef.current = isPristineSync;
             if (isPristineSync) {
                setFormData(prev => ({...prev, amount: 0}));
             }
        }
    }, [formData.hash, transaction, isDataLoading]);
    
    // Server action response handler
    React.useEffect(() => {
        if (state?.message) {
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: state.message });
        }
    }, [state, toast]);
    
    // Effect to fetch SMS suggestions
    React.useEffect(() => {
        const fetchSuggestions = async () => {
            if (!formData.clientId || !formData.bankAccountId) {
                setSuggestedSms([]);
                return;
            }

            setIsLoadingSuggestions(true);
            try {
                const [smsSnapshot, clientSnapshot] = await Promise.all([
                    get(ref(db, 'sms_transactions')),
                    get(ref(db, `clients/${formData.clientId}`)),
                ]);

                if (!smsSnapshot.exists() || !clientSnapshot.exists()) {
                    setSuggestedSms([]);
                    setIsLoadingSuggestions(false);
                    return;
                }

                const smsData = smsSnapshot.val() || {};
                const allSmsTxs: SmsTransaction[] = Object.keys(smsData).map(key => ({ id: key, ...smsData[key] }));
                const client = clientSnapshot.val() as Client;
                
                if (!client) {
                    setSuggestedSms([]);
                    setIsLoadingSuggestions(false);
                    return;
                }

                const clientNameSet = client.name ? new Set(client.name.toLowerCase().split(/\s+/).filter(p => p.length > 1)) : new Set<string>();
                const clientPhones = (client.phone ? (Array.isArray(client.phone) ? client.phone : [client.phone]) : []).map(p => p.replace(/[^0-9]/g, ''));

                const matches = allSmsTxs.filter(sms => {
                    if (sms.status !== 'pending' || sms.account_id !== formData.bankAccountId) return false;
                    
                    const formTxType = formData.type.toLowerCase();
                    const smsTxType = sms.type === 'credit' ? 'deposit' : 'withdraw';
                    if (formTxType !== smsTxType) return false;

                    const smsPerson = sms.client_name?.toLowerCase();
                    if (!smsPerson) return false;
                    
                    if (clientPhones.some(p => p && smsPerson.includes(p))) return true;
                    
                    const smsNameParts = smsPerson.split(/\s+/).filter(p => p.length > 1);
                    if (smsNameParts.length === 0) return false;

                    let commonWords = 0;
                    for (const part of smsNameParts) {
                        if (clientNameSet.has(part)) {
                            commonWords++;
                        }
                    }
                    
                    return commonWords >= 2;
                });
                
                setSuggestedSms(matches);
            } catch (error) {
                console.error("Failed to fetch SMS suggestions:", error);
                setSuggestedSms([]);
            } finally {
                setIsLoadingSuggestions(false);
            }
        };

        fetchSuggestions();
    }, [formData.clientId, formData.bankAccountId, formData.type]);
    
    const getNumberValue = (value: string | number) => {
        const num = parseFloat(String(value));
        return isNaN(num) ? 0 : num;
    };

    const recalculateFinancials = React.useCallback((amount: number, type: Transaction['type'], currency: Transaction['currency'], hash: string | undefined, usdtFromSync: number | undefined): Partial<Transaction> => {
        const result: Partial<Pick<Transaction, 'amount_usd' | 'fee_usd' | 'expense_usd' | 'amount_usdt'>> = {};
        if (!settings || !currency) return result;
        
        const rate = getRate(currency);
        if (rate <= 0) return result;
        
        const newAmountUSD = amount * rate;
        result.amount_usd = parseFloat(newAmountUSD.toFixed(2));
        
        if (hash) {
            let newFeeUSD = 0;
            let newExpenseUSD = 0;
            const fixedUsdtAmount = usdtFromSync || 0;

            if (type === 'Deposit') {
                const difference = newAmountUSD - fixedUsdtAmount;
                if (difference >= 0) newFeeUSD = difference;
                else newExpenseUSD = -difference;
            } else { // Withdraw
                const difference = fixedUsdtAmount - newAmountUSD;
                if (difference >= 0) newFeeUSD = difference;
                else newExpenseUSD = -difference;
            }
            result.fee_usd = parseFloat(newFeeUSD.toFixed(2));
            result.expense_usd = parseFloat(newExpenseUSD.toFixed(2));
            result.amount_usdt = fixedUsdtAmount;
        } else {
            let finalFee = 0;
            let newUsdtAmount = 0;
            
            if (type === 'Deposit') {
                const feePercent = (settings.deposit_fee_percent || 0) / 100;
                const calculatedFee = newAmountUSD * feePercent;
                finalFee = Math.max(calculatedFee, settings.minimum_fee_usd || 0);
                newUsdtAmount = newAmountUSD - finalFee;
            } else {
                const feePercent = (settings.withdraw_fee_percent || 0) / 100;
                if (feePercent < 0 || feePercent >= 1) {
                    finalFee = 0;
                } else {
                    const grossAmount = newAmountUSD / (1 - feePercent);
                    finalFee = grossAmount - newAmountUSD;
                    newUsdtAmount = grossAmount;
                }
            }
            result.fee_usd = parseFloat(finalFee.toFixed(2));
            result.expense_usd = 0;
            result.amount_usdt = parseFloat(newUsdtAmount.toFixed(2));
        }
        
        return result;
    }, [settings, getRate]);

    const handleManualAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAmountNum = getNumberValue(e.target.value);
        pristineRef.current = false;

        setFormData(prev => {
            const updates = recalculateFinancials(newAmountNum, prev.type, prev.currency, prev.hash, prev.amount_usdt);
            return {
                ...prev,
                amount: newAmountNum,
                ...updates
            };
        });
    };

    const handleManualUsdtAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUsdtAmount = getNumberValue(e.target.value);

        setFormData(prev => {
            if (!settings || prev.hash) return { ...prev, amount_usdt: newUsdtAmount };
            const amountUSD = getNumberValue(prev.amount_usd);
            let newFeeUSD = 0;
            let newExpenseUSD = 0;

            if (prev.type === 'Deposit') {
                const difference = amountUSD - newUsdtAmount;
                if (difference >= 0) {
                    newFeeUSD = difference;
                    newExpenseUSD = 0;
                } else {
                    newFeeUSD = 0;
                    newExpenseUSD = -difference;
                }
            } else { // Withdraw
                const difference = newUsdtAmount - amountUSD;
                if (difference >= 0) {
                    newFeeUSD = difference;
                    newExpenseUSD = 0;
                } else {
                    newFeeUSD = 0;
                    newExpenseUSD = -difference;
                }
            }
            return {
                ...prev,
                amount_usdt: newUsdtAmount,
                fee_usd: parseFloat(newFeeUSD.toFixed(2)),
                expense_usd: parseFloat(newExpenseUSD.toFixed(2)),
            };
        });
    };

    const handleSuggestionClick = async (sms: SmsTransaction) => {
        // First, optimistically update the UI
        const newAmount = sms.amount || 0;
        const smsCurrency = (sms.currency || 'USD') as Transaction['currency'];

        setFormData(prev => {
            const updates = recalculateFinancials(newAmount, prev.type, smsCurrency, prev.hash, prev.hash ? prev.amount_usdt : undefined);
            return {
                ...prev,
                amount: newAmount,
                currency: smsCurrency,
                linkedSmsId: sms.id,
                ...updates,
            }
        });
        setSuggestedSms([]);
        
        // Then, call the server action to update the status
        const result = await matchSmsTransaction(sms.id);
        if (result.success) {
            toast({
                title: 'SMS Matched',
                description: 'The selected SMS has been marked as matched.',
            });
        } else {
             toast({
                variant: 'destructive',
                title: 'Matching Failed',
                description: result.message || 'Could not mark SMS as matched.',
            });
        }
    };
    
    const handleBankAccountSelect = (accountId: string, data = formData) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (!selectedAccount) return;
        setFormData({ ...data, bankAccountId: accountId, currency: selectedAccount.currency || 'USD' });
    };

    const handleClientSelect = (clientId: string) => {
        const selectedClient = clients.find(c => c.id === clientId);
        if (!selectedClient) return;

        const favoriteAccount = bankAccounts.find(acc => acc.id === selectedClient.favoriteBankAccountId);

        setFormData(prev => ({
            ...prev,
            clientId: clientId,
            bankAccountId: favoriteAccount?.id || '',
            currency: favoriteAccount?.currency || 'USD',
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

            <form action={formAction} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-3">
                    <Card>
                        <CardHeader>
                            <CardTitle>Transaction Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="date">Date and Time</Label>
                                    <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant={"outline"} size="sm" className={cn("w-full justify-start text-left font-normal", !formData.date && "text-muted-foreground")}>
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
                                <ClientSelector 
                                    clients={clients}
                                    value={formData.clientId}
                                    onSelect={handleClientSelect}
                                />
                                <input type="hidden" name="clientId" value={formData.clientId || ""} />
                            </div>
                            <div className="space-y-2">
                                <Label>Bank Account</Label>
                                <BankAccountSelector
                                    accounts={bankAccounts}
                                    value={formData.bankAccountId}
                                    onSelect={handleBankAccountSelect}
                                />
                                <input type="hidden" name="bankAccountId" value={formData.bankAccountId || ''} />
                            </div>
                            <div className="space-y-2">
                                <Label>Crypto Wallet</Label>
                                <BankAccountSelector
                                    accounts={cryptoWallets}
                                    value={formData.cryptoWalletId}
                                    onSelect={(v) => handleFieldChange('cryptoWalletId', v)}
                                />
                                <input type="hidden" name="cryptoWalletId" value={formData.cryptoWalletId || ''} />
                            </div>
                        </CardContent>
                    </Card>

                    {(isLoadingSuggestions || suggestedSms.length > 0) && (
                        <Card>
                            <CardHeader>
                                <CardTitle>SMS Suggestions</CardTitle>
                                <CardDescription>Matching pending SMS messages for this client and account. Click to apply.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2">
                                {isLoadingSuggestions && <p className="text-sm text-muted-foreground">Loading suggestions...</p>}
                                {!isLoadingSuggestions && suggestedSms.map(sms => (
                                    <Button key={sms.id} type="button" variant="outline" size="sm" onClick={() => handleSuggestionClick(sms)}>
                                        <MessageSquare className="mr-2 h-3 w-3" />
                                        {sms.amount} {sms.currency} ({format(new Date(sms.parsed_at), 'MMM d')})
                                    </Button>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Financial Details</CardTitle>
                            <CardDescription className="text-xs">
                                {formData.hash 
                                ? "This was synced from BscScan. Please enter the local currency Amount." 
                                : "Enter local Amount or Final USDT to auto-calculate."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                             <div className="flex items-center gap-2">
                                <Label htmlFor="amount" className="w-1/3 shrink-0 text-right text-xs">Amount ({formData.currency})</Label>
                                <Input id="amount" name="amount" type="number" step="any" required value={amountToDisplay} onChange={handleManualAmountChange}/>
                                <input type="hidden" name="currency" value={formData.currency} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="amount_usd" className="w-1/3 shrink-0 text-right text-xs">Amount (USD)</Label>
                                <Input id="amount_usd" name="amount_usd" type="number" step="any" required value={formData.amount_usd} readOnly />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="fee_usd" className="w-1/3 shrink-0 text-right text-xs">Fee (USD)</Label>
                                <Input id="fee_usd" name="fee_usd" type="number" step="any" required value={formData.fee_usd} readOnly />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="expense_usd" className="w-1/3 shrink-0 text-right text-xs">Expense / Loss (USD)</Label>
                                <Input id="expense_usd" name="expense_usd" type="number" step="any" value={formData.expense_usd || 0} readOnly />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="amount_usdt" className="w-1/3 shrink-0 text-right text-xs">Final USDT Amount</Label>
                                <Input
                                    id="amount_usdt"
                                    name="amount_usdt"
                                    type="number"
                                    step="any"
                                    required
                                    value={formData.amount_usdt}
                                    onChange={handleManualUsdtAmountChange}
                                    readOnly={!!formData.hash}
                                />
                            </div>
                        </CardContent>
                        <CardFooter>
                            <input type="hidden" name="linkedSmsId" value={formData.linkedSmsId || ''} />
                            <SubmitButton />
                        </CardFooter>
                    </Card>
                </div>
                <div className="md:col-span-1 space-y-3">
                    {transaction && client && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Actions</CardTitle>
                                <CardDescription className="text-xs">Download or share the invoice.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                 <Button onClick={handleDownloadInvoice} disabled={isDownloading || isSharing} size="sm" className="w-full">
                                    {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                                    {isDownloading ? 'Downloading...' : 'Download Invoice'}
                                </Button>
                                <Button onClick={handleShareInvoice} disabled={isSharing || isDownloading} size="sm" className="w-full">
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
                        <CardContent className="space-y-3">
                            <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." value={formData.notes || ''} onChange={(e) => handleFieldChange('notes', e.target.value)} rows={2}/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="attachment_url">Upload Transaction Image</Label>
                                <Input id="attachment_url" name="attachment_url" type="file" size="sm" />
                                {transaction?.attachment_url && <a href={transaction.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View current attachment</a>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
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
                            <div className="grid md:grid-cols-2 gap-3">
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

function ClientSelector({ clients, value, onSelect }: { clients: Client[], value?: string | null, onSelect: (id: string) => void }) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");

    const selectedClient = value ? clients.find(c => c.id === value) : null;
    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    const filteredClients = React.useMemo(() => {
        if (!search) {
            return [];
        }
        const normalizedSearch = normalizeArabic(search.toLowerCase().trim());
        if (!normalizedSearch) return [];

        const searchTerms = normalizedSearch.split(' ').filter(Boolean);

        return clients.filter(client => {
            const name = normalizeArabic((client.name || '').toLowerCase());
            const phone = getPhone(client.phone).toLowerCase();
            
            // Direct substring match on phone first. Use original search value.
            if (phone.includes(search.trim())) {
                return true;
            }

            // For name, check if all search terms match the start of some word in the name
            const nameWords = name.split(' ');
            return searchTerms.every(term => 
                nameWords.some(nameWord => nameWord.startsWith(term))
            );
        });
    }, [search, clients]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal text-left h-auto min-h-10 py-2">
                     <span className="truncate">
                        {selectedClient ? (
                            <div>
                                <div className="truncate font-medium">{selectedClient.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{getPhone(selectedClient.phone)}</div>
                            </div>
                        ) : "Select a client..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search by name or phone..." onValueChange={setSearch} />
                    <CommandList>
                         {search.length === 0 && (
                             <CommandEmpty>Start typing to search for a client.</CommandEmpty>
                        )}
                        {search.length > 0 && filteredClients.length === 0 && (
                            <CommandEmpty>No client found.</CommandEmpty>
                        )}
                        <CommandGroup>
                            {filteredClients.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={`${client.id} ${client.name} ${getPhone(client.phone)}`}
                                    onSelect={() => {
                                        onSelect(client.id);
                                        setOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    <Check className={cn("mr-2 h-4 w-4", value === client.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex-1 truncate">
                                        <div className="truncate">{client.name}</div>
                                        <div className="text-xs text-muted-foreground truncate">{getPhone(client.phone)}</div>
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
