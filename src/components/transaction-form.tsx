
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Download, Loader2, Share2, MessageSquare, Check, ChevronsUpDown, UserCircle, ChevronDown } from 'lucide-react';
import React from 'react';
import { createTransaction, type TransactionFormState, searchClients, findUnassignedTransactionsByAddress } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Transaction, Settings, SmsTransaction, FiatRate, CryptoFee } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import html2canvas from 'html2canvas';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import dynamic from 'next/dynamic';
import { Alert, AlertTitle } from './ui/alert';

const Invoice = dynamic(() => import('@/components/invoice').then(mod => mod.Invoice), { ssr: false });


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
    createdAt: '',
    linkedSmsId: '',
    exchange_rate_commission: 0,
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

  const sortedAccounts = React.useMemo(() => {
    return [...accounts].sort((a, b) => {
        const priorityA = a.priority ?? Infinity;
        const priorityB = b.priority ?? Infinity;
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return (a.name || '').localeCompare(b.name || '');
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

    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [fiatRates, setFiatRates] = React.useState<FiatRate[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    
    const [isSaving, setIsSaving] = React.useState(false);
    const [formErrors, setFormErrors] = React.useState<TransactionFormState['errors']>();
    

    const [attachmentToUpload, setAttachmentToUpload] = React.useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
    
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);

    const [formData, setFormData] = React.useState<Transaction>(initialFormData);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(client || null);
    
    const [batchUpdateInfo, setBatchUpdateInfo] = React.useState<{ client: Client, count: number } | null>(null);

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const settingsRef = ref(db, 'settings');

        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'));
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });
        const unsubSettings = onValue(settingsRef, (snap) => {
            const settingsData = snap.val();
            if(settingsData) {
                setFiatRates(settingsData.fiat_rates ? Object.values(settingsData.fiat_rates) : []);
                setCryptoFees(settingsData.crypto_fees || null);
            }
        });
        
        Promise.all([ get(accountsRef), get(settingsRef) ]).then(() => {
            setIsDataLoading(false);
        });

        return () => { unsubAccounts(); unsubSettings(); };
    }, []);

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
    
    const recalculateFinancials = React.useCallback((
        localAmount: number,
        type: Transaction['type'],
        currency: string,
        manualUsdtAmount?: number
    ): Partial<Transaction> => {

        const result: Partial<Transaction> = {};

        if (!cryptoFees || fiatRates.length === 0) return result;

        const rateInfo = fiatRates.find(r => r.currency === currency);
        if (!rateInfo && currency !== 'USD') return result;

        const systemRate = currency === 'USD' ? 1 : (type === 'Deposit' ? rateInfo!.systemBuy : rateInfo!.systemSell);
        const clientRate = currency === 'USD' ? 1 : (type === 'Deposit' ? rateInfo!.clientBuy : rateInfo!.clientSell);

        if (systemRate <= 0 || clientRate <= 0) return result;

        const systemAmountUSD = localAmount / systemRate;
        const clientAmountUSD = localAmount / clientRate;
        
        result.amount_usd = parseFloat(clientAmountUSD.toFixed(2));
        result.exchange_rate_commission = parseFloat((clientAmountUSD - systemAmountUSD).toFixed(2));
        
        let feePercent = 0;
        let minFee = 0;
        if(type === 'Deposit') {
            feePercent = cryptoFees.buy_fee_percent / 100;
            minFee = cryptoFees.minimum_buy_fee;
        } else {
            feePercent = cryptoFees.sell_fee_percent / 100;
            minFee = cryptoFees.minimum_sell_fee;
        }

        const calculatedFee = clientAmountUSD * feePercent;
        const cryptoFee = Math.max(calculatedFee, minFee);
        
        const initialUsdtAmount = clientAmountUSD - cryptoFee;

        if(manualUsdtAmount !== undefined) {
             const difference = manualUsdtAmount - initialUsdtAmount;
             if(difference > 0) { // Gave a discount
                result.expense_usd = parseFloat(difference.toFixed(2));
                result.fee_usd = parseFloat(cryptoFee.toFixed(2));
             } else { // Charged extra
                result.expense_usd = 0;
                result.fee_usd = parseFloat((cryptoFee - difference).toFixed(2));
             }
            result.amount_usdt = manualUsdtAmount;
        } else {
            result.fee_usd = parseFloat(cryptoFee.toFixed(2));
            result.expense_usd = 0;
            result.amount_usdt = parseFloat(initialUsdtAmount.toFixed(2));
        }

        return result;

    }, [fiatRates, cryptoFees]);


    const handleManualAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newAmountNum = getNumberValue(e.target.value);

        setFormData(prev => {
            const updates = recalculateFinancials(newAmountNum, prev.type, prev.currency);
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
            const updates = recalculateFinancials(prev.amount, prev.type, prev.currency, newUsdtAmount);
            return { ...prev, ...updates, amount_usdt: newUsdtAmount };
        });
    };
    
    const handleBankAccountSelect = (accountId: string, data = formData) => {
        const selectedAccount = bankAccounts.find(acc => acc.id === accountId);
        if (!selectedAccount) return;

        const newCurrency = selectedAccount.currency || 'USD';
        const updates = recalculateFinancials(data.amount, data.type, newCurrency);
        
        setFormData({ ...data, bankAccountId: accountId, currency: newCurrency, ...updates });
    };

    const handleClientSelect = async (client: Client | null) => {
        setSelectedClient(client);
        
        let newFormData = { ...formData };

        if (client) {
            const favoriteAccount = bankAccounts.find(acc => acc.id === client.favoriteBankAccountId);
            if(favoriteAccount) {
                 const newCurrency = favoriteAccount.currency || 'USD';
                 const updates = recalculateFinancials(newFormData.amount, newFormData.type, newCurrency);
                 newFormData = { ...newFormData, ...updates, bankAccountId: favoriteAccount.id, currency: newCurrency };
            }
           
            newFormData.clientId = client.id;
            
            if (formData.type === 'Deposit' && formData.client_wallet_address) {
                const count = await findUnassignedTransactionsByAddress(formData.client_wallet_address);
                if (count > 0) {
                    setBatchUpdateInfo({ client, count });
                }
            }
        } else {
             newFormData = {
                ...newFormData,
                clientId: '',
                bankAccountId: '',
                currency: 'USD',
            };
        }
        
        setFormData(newFormData);
    };

    const handleBatchUpdateConfirm = async () => {
        if (!batchUpdateInfo || !formData.client_wallet_address) return;
        
        const result = await batchUpdateClientForTransactions(
            batchUpdateInfo.client.id, 
            formData.client_wallet_address
        );

        toast({
            title: result.error ? 'Error' : 'Success',
            description: result.message
        });

        if (!result.error) {
            router.refresh();
        }

        setBatchUpdateInfo(null);
    };
    
    const handleFieldChange = (field: keyof Transaction, value: any) => {
        let newFormData = { ...formData, [field]: value };
        if(field === 'type') {
            const updates = recalculateFinancials(newFormData.amount, value, newFormData.currency);
            newFormData = { ...newFormData, ...updates };
        }
        setFormData(newFormData);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        setFormErrors(undefined);

        const formElement = e.target as HTMLFormElement;
        const actionFormData = new FormData(formElement);
        
        actionFormData.set('date', formData.date ? new Date(formData.date).toISOString() : new Date().toISOString());
        actionFormData.set('clientId', formData.clientId || '');
        actionFormData.set('bankAccountId', formData.bankAccountId || '');
        actionFormData.set('cryptoWalletId', formData.cryptoWalletId || '');
        actionFormData.set('currency', formData.currency);
        actionFormData.set('amount_usd', String(formData.amount_usd));
        actionFormData.set('fee_usd', String(formData.fee_usd));
        actionFormData.set('expense_usd', String(formData.expense_usd || 0));
        actionFormData.set('amount_usdt', String(formData.amount_usdt));
        actionFormData.set('exchange_rate_commission', String(formData.exchange_rate_commission || 0));

        if (formData.linkedSmsId) {
            actionFormData.set('linkedSmsId', formData.linkedSmsId);
        }
        
        if(attachmentToUpload) {
            actionFormData.set('attachment_url_input', attachmentToUpload);
        }

        if (formData.status === 'Confirmed' && invoiceRef.current) {
            try {
                const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: null });
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                    const invoiceFile = new File([blob], 'invoice.png', { type: 'image/png' });
                    actionFormData.set('invoice_image', invoiceFile);
                }
            } catch (error) {
                console.error("Failed to generate invoice image:", error);
                toast({ variant: 'destructive', title: 'Invoice Generation Failed', description: 'Could not create invoice image. The transaction will be saved without it.' });
            }
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
            <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                <div className="w-[420px]">
                    <Invoice ref={invoiceRef} transaction={{...formData, date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString() }} client={selectedClient} />
                </div>
            </div>

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
                                            <SelectItem value="Deposit">Deposit (Buy USDT)</SelectItem>
                                            <SelectItem value="Withdraw">Withdraw (Sell USDT)</SelectItem>
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
                                {formErrors?.clientId && <p className="text-sm text-destructive">{formErrors.clientId[0]}</p>}
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

                    <Card>
                        <CardHeader>
                            <CardTitle>Financial Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                             <div className="flex items-center gap-2">
                                <Label htmlFor="amount" className="w-1/3 shrink-0 text-right text-xs">Local Amount ({formData.currency})</Label>
                                <Input id="amount" name="amount" type="number" step="any" required value={amountToDisplay} onChange={handleManualAmountChange}/>
                            </div>
                             {formErrors?.amount && <p className="text-sm text-destructive text-right">{formErrors.amount[0]}</p>}
                            
                             <div className="flex items-center gap-2">
                                <Label className="w-1/3 shrink-0 text-right text-xs">Amount (USD)</Label>
                                <Input type="number" step="any" value={formData.amount_usd} readOnly disabled className="bg-muted/50"/>
                            </div>

                             <Alert variant="default" className="p-3">
                                <AlertDescription className="text-xs space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span>Exchange Rate Commission:</span>
                                        <span className="font-mono">{formData.exchange_rate_commission?.toFixed(2) || '0.00'} USD</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span>Crypto Fee:</span>
                                        <span className="font-mono">{formData.fee_usd?.toFixed(2) || '0.00'} USD</span>
                                    </div>
                                     <div className="flex justify-between items-center text-red-600">
                                        <span>Discount / Expense:</span>
                                        <span className="font-mono">{formData.expense_usd?.toFixed(2) || '0.00'} USD</span>
                                    </div>
                                </AlertDescription>
                            </Alert>

                            <div className="flex items-center gap-2">
                                <Label htmlFor="amount_usdt" className="w-1/3 shrink-0 text-right text-xs">Final USDT Amount</Label>
                                <Input id="amount_usdt" name="amount_usdt" type="number" step="any" required value={formData.amount_usdt} onChange={handleManualUsdtAmountChange} />
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
                        </CardContent>
                    </Card>
                </div>
            </form>
            
            {batchUpdateInfo && (
                 <AlertDialog open={!!batchUpdateInfo} onOpenChange={() => setBatchUpdateInfo(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Assign Client to Other Transactions?</AlertDialogTitle>
                            <AlertDialogDescription>
                                We found {batchUpdateInfo.count} other unassigned transaction(s) from this same wallet address.
                                Do you want to assign them all to "{batchUpdateInfo.client.name}"?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setBatchUpdateInfo(null)}>No, Just This One</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBatchUpdateConfirm}>Yes, Assign All</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}

function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [inputValue, setInputValue] = React.useState(selectedClient?.name || "");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);

    React.useEffect(() => {
        if (!isOpen) return;

        if (inputValue.trim().length < 2) {
            setSearchResults([]);
            if (inputValue.trim().length === 0 && selectedClient) {
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
