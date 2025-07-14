

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Download, Loader2, Share2, MessageSquare, Check, ChevronsUpDown, UserCircle, ChevronDown } from 'lucide-react';
import React from 'react';
import { createTransaction, type TransactionFormState, searchClients, getSmsSuggestions } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Transaction, Settings, SmsTransaction, TransactionFlag } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { Invoice } from '@/components/invoice';
import html2canvas from 'html2canvas';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { useRouter } from 'next/navigation';
import Link from 'next/link';


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

export function TransactionForm({ transaction, client }: { transaction?: Transaction, client?: Client | null }) {
    const { toast } = useToast();
    const router = useRouter();

    // Data state
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const [labels, setLabels] = React.useState<TransactionFlag[]>([]);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    
    // Form State
    const [isSaving, setIsSaving] = React.useState(false);
    const [formErrors, setFormErrors] = React.useState<TransactionFormState['errors']>();
    
    // Suggestion State
    const [suggestedSms, setSuggestedSms] = React.useState<SmsTransaction[]>([]);
    const [isLoadingSuggestions, setIsLoadingSuggestions] = React.useState(false);

    // Attachment State
    const [attachmentToUpload, setAttachmentToUpload] = React.useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
    
    // Invoice generation state
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);

    const [formData, setFormData] = React.useState<Transaction>(initialFormData);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(client || null);

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
        const labelsRef = ref(db, 'labels');

        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'));
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });
        const unsubSettings = onValue(settingsRef, (snap) => setSettings(snap.val() || null));
        const unsubLabels = onValue(labelsRef, (snap) => setLabels(snap.val() ? Object.values(snap.val()) : []));
        
        Promise.all([ get(accountsRef), get(settingsRef), get(labelsRef) ]).then(() => {
            setIsDataLoading(false);
        });

        return () => { unsubAccounts(); unsubSettings(); unsubLabels(); };
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
            setSelectedClient(client || null);
            setFormData(formState);
        }
    }, [transaction, client, isDataLoading, bankAccounts]);
    
    // Effect to fetch SMS suggestions
    React.useEffect(() => {
        const fetchSuggestions = async () => {
            if (!formData.clientId || !formData.bankAccountId) {
                setSuggestedSms([]);
                return;
            }

            setIsLoadingSuggestions(true);
            try {
                const suggestions = await getSmsSuggestions(formData.clientId, formData.bankAccountId);
                setSuggestedSms(suggestions);
            } catch (error) {
                console.error("Failed to fetch SMS suggestions:", error);
                setSuggestedSms([]);
            } finally {
                setIsLoadingSuggestions(false);
            }
        };

        fetchSuggestions();
    }, [formData.clientId, formData.bankAccountId]);
    
    // Effect to handle attachment preview cleanup
    React.useEffect(() => {
        return () => {
            if (attachmentPreview) {
                URL.revokeObjectURL(attachmentPreview);
            }
        };
    }, [attachmentPreview]);

    const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAttachmentToUpload(file);
            if (attachmentPreview) {
                URL.revokeObjectURL(attachmentPreview);
            }
            if (file.type.startsWith('image/')) {
                setAttachmentPreview(URL.createObjectURL(file));
            } else {
                setAttachmentPreview(null);
            }
        } else {
            setAttachmentToUpload(null);
            setAttachmentPreview(null);
        }
    };
    
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
        
        if (hash && usdtFromSync) {
            let newFeeUSD = 0;
            let newExpenseUSD = 0;
            
            if (type === 'Deposit') {
                const difference = newAmountUSD - usdtFromSync;
                if (difference >= 0) newFeeUSD = difference;
                else newExpenseUSD = -difference;
            } else { // Withdraw
                const difference = usdtFromSync - newAmountUSD;
                if (difference >= 0) newFeeUSD = difference;
                else newExpenseUSD = -difference;
            }
            result.fee_usd = parseFloat(newFeeUSD.toFixed(2));
            result.expense_usd = parseFloat(newExpenseUSD.toFixed(2));
            result.amount_usdt = usdtFromSync;
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
        
        toast({
            title: 'SMS Applied',
            description: 'The selected SMS has been applied to the form. It will be marked as used upon saving.',
        });
    };
    
    const handleBankAccountSelect = (accountId: string, data = formData) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (!selectedAccount) return;
        setFormData({ ...data, bankAccountId: accountId, currency: selectedAccount.currency || 'USD' });
    };

    const handleClientSelect = (client: Client | null) => {
        setSelectedClient(client);
        
        if (client) {
            const favoriteAccount = bankAccounts.find(acc => acc.id === client.favoriteBankAccountId);
            setFormData(prev => ({
                ...prev,
                clientId: client.id,
                bankAccountId: favoriteAccount?.id || '',
                currency: favoriteAccount?.currency || 'USD',
            }));
        } else {
             setFormData(prev => ({
                ...prev,
                clientId: '',
                bankAccountId: '',
                currency: 'USD',
            }));
        }
    };
    
    const handleFieldChange = (field: keyof Omit<Transaction, 'amount' | 'flags'>, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleFlagChange = (flagId: string) => {
        setFormData(prev => {
            const newFlags = prev.flags.includes(flagId)
                ? prev.flags.filter(f => f !== flagId)
                : [...prev.flags, flagId];
            return { ...prev, flags: newFlags };
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        setFormErrors(undefined);

        const formElement = e.target as HTMLFormElement;
        const actionFormData = new FormData(formElement);
        
        // Append dynamic/state data to FormData
        actionFormData.set('date', formData.date ? new Date(formData.date).toISOString() : new Date().toISOString());
        actionFormData.set('clientId', formData.clientId || '');
        actionFormData.set('bankAccountId', formData.bankAccountId || '');
        actionFormData.set('cryptoWalletId', formData.cryptoWalletId || '');
        actionFormData.set('currency', formData.currency);
        actionFormData.set('amount_usd', String(formData.amount_usd));
        actionFormData.set('fee_usd', String(formData.fee_usd));
        actionFormData.set('expense_usd', String(formData.expense_usd || 0));
        actionFormData.set('amount_usdt', String(formData.amount_usdt));
        actionFormData.set('linkedSmsId', formData.linkedSmsId || '');
        
        formData.flags.forEach(flagId => {
            actionFormData.append('flags', flagId);
        });
        
        if(attachmentToUpload) {
            actionFormData.set('attachment_url', attachmentToUpload);
        }

        const result = await createTransaction(transaction?.id || null, actionFormData);
        
        if (result?.success && result.transactionId) {
            router.push(`/transactions/${result.transactionId}/edit`);
        } else if (result?.errors) {
            setFormErrors(result.errors);
            toast({ variant: 'destructive', title: 'Error Recording Transaction', description: result.message });
        } else if (result?.message) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setIsSaving(false);
    };

    const handleDownloadInvoice = async () => {
        if (!invoiceRef.current || !transaction) return;
        setIsDownloading(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, { scale: 3, useCORS: true, backgroundColor: null });
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
        if (!invoiceRef.current || !transaction || !selectedClient) return;
        setIsSharing(true);
        try {
            const canvas = await html2canvas(invoiceRef.current, { scale: 3, useCORS: true, backgroundColor: null });
            if (navigator.share) {
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        toast({ variant: "destructive", title: "Share Failed", description: "Could not create image blob." });
                        setIsSharing(false);
                        return;
                    }
                    const file = new File([blob], `invoice-${transaction.id.slice(-8).toUpperCase()}.png`, { type: 'image/png' });
                    try {
                        await navigator.share({ files: [file], title: `Invoice for ${selectedClient.name}`, text: `Here is the invoice for transaction ${transaction.id}.` });
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

    const amountToDisplay = formData.hash && formData.amount === 0 ? '' : (formData.amount || '');

    return (
        <>
            {transaction && (
                <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                    <div className="w-[420px]">
                        <Invoice ref={invoiceRef} transaction={{...formData, date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString() }} client={selectedClient} />
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                                    selectedClient={selectedClient}
                                    onSelect={handleClientSelect}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Bank Account</Label>
                                <BankAccountSelector
                                    accounts={bankAccounts}
                                    value={formData.bankAccountId}
                                    onSelect={handleBankAccountSelect}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Crypto Wallet</Label>
                                <BankAccountSelector
                                    accounts={cryptoWallets}
                                    value={formData.cryptoWalletId}
                                    onSelect={(v) => handleFieldChange('cryptoWalletId', v)}
                                />
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
                            <Button type="submit" disabled={isSaving} size="sm" className="w-full">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                {isSaving ? 'Recording...' : 'Record Transaction'}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
                <div className="md:col-span-1 space-y-3">
                    {transaction && (
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
                                <Label htmlFor="attachment_url_input">Upload Transaction Image</Label>
                                <Input id="attachment_url_input" name="attachment_url_input" type="file" size="sm" onChange={handleAttachmentChange} />
                                {attachmentPreview && (
                                    <div className="mt-2">
                                        <img src={attachmentPreview} alt="Preview" className="rounded-md max-h-48 w-auto" />
                                    </div>
                                )}
                                {!attachmentPreview && transaction?.attachment_url && <a href={transaction.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View current attachment</a>}
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
                                <Label>Labels</Label>
                                <LabelSelector 
                                    labels={labels}
                                    selectedLabels={formData.flags}
                                    onLabelChange={handleFlagChange}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </form>
        </>
    );
}

function LabelSelector({ labels, selectedLabels, onLabelChange }: { labels: TransactionFlag[], selectedLabels: string[], onLabelChange: (id: string) => void }) {
    const [showAll, setShowAll] = React.useState(false);
    const visibleLabels = showAll ? labels : labels.slice(0, 5);

    if (labels.length === 0) {
        return <p className="text-sm text-muted-foreground">No labels configured. <Link href="/labels" className="text-primary underline">Manage Labels</Link></p>;
    }

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                {visibleLabels.map(label => (
                    <Button
                        key={label.id}
                        type="button"
                        variant={selectedLabels.includes(label.id) ? 'default' : 'outline'}
                        onClick={() => onLabelChange(label.id)}
                        className={cn("text-xs h-7", selectedLabels.includes(label.id) && 'text-white')}
                        style={selectedLabels.includes(label.id) ? { backgroundColor: label.color } : { borderColor: label.color, color: label.color }}
                    >
                        {label.name}
                    </Button>
                ))}
            </div>
            {labels.length > 5 && (
                <Button type="button" variant="link" size="sm" className="p-0 h-auto" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Show Less' : 'Show More'} <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', showAll && 'rotate-180')} />
                </Button>
            )}
        </div>
    );
}


function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [inputValue, setInputValue] = React.useState(selectedClient?.name || "");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);

    // Debounce search input
    React.useEffect(() => {
        if (!isOpen) return;

        if (inputValue.trim().length < 2) {
            setSearchResults([]);
            if (inputValue.trim().length === 0 && selectedClient) {
                // User cleared the input, so un-select the client
                onSelect(null);
            }
            return;
        }

        setIsLoading(true);
        const timerId = setTimeout(async () => {
            const results = await searchClients(inputValue);
            setSearchResults(results);
            setIsLoading(false);
        }, 300);

        return () => clearTimeout(timerId);
    }, [inputValue, isOpen, onSelect, selectedClient]);
    
    // Update input text when client is selected from parent
    React.useEffect(() => {
        setInputValue(selectedClient?.name || "");
    }, [selectedClient]);

    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    const handleSelect = (client: Client) => {
        onSelect(client);
        setIsOpen(false);
        setInputValue(client.name);
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={isOpen}
                    className="w-full justify-between font-normal"
                >
                    {selectedClient ? selectedClient.name : "Select client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput 
                        placeholder="Search by name or phone..."
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && inputValue && inputValue.length > 1 && searchResults.length === 0 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={`${client.name} ${getPhone(client.phone)}`}
                                    onSelect={() => handleSelect(client)}
                                >
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
