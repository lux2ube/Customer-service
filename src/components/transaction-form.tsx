
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Download, Loader2, Share2, Check, ChevronsUpDown, Bot, HandCoins, PlusCircle, Pencil, XIcon } from 'lucide-react';
import React from 'react';
import { createTransaction, type TransactionFormState, searchClients, getAvailableClientFunds } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Transaction, Settings, FiatRate, CryptoFee, UnifiedReceipt } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get, query, limitToLast, orderByChild } from 'firebase/database';
import html2canvas from 'html2canvas';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertDialogTitleComponent, // Renaming to avoid conflict
} from "@/components/ui/alert-dialog";
import dynamic from 'next/dynamic';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { Checkbox } from './ui/checkbox';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';

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
  disabled = false
}: {
  accounts: Account[];
  value: string | null | undefined;
  onSelect: (accountId: string) => void;
  disabled?: boolean;
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
          disabled={disabled}
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
          disabled={disabled}
        >
          Show More...
        </Button>
      )}
    </div>
  );
}

export function TransactionForm({ transaction, client, onSuccess }: { transaction?: Transaction | null, client?: Client | null, onSuccess: (txId: string) => void }) {
    const { toast } = useToast();
    const [isEditMode, setIsEditMode] = React.useState(!transaction);

    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    
    const [isSaving, setIsSaving] = React.useState(false);
    const [formErrors, setFormErrors] = React.useState<TransactionFormState['errors']>();
    
    const [attachmentToUpload, setAttachmentToUpload] = React.useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
    
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const invoiceRef = React.useRef<HTMLDivElement>(null);

    const [formData, setFormData] = React.useState<Transaction>(transaction || initialFormData);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(client || null);
    const [availableFunds, setAvailableFunds] = React.useState<UnifiedReceipt[]>([]);
    const [selectedFundIds, setSelectedFundIds] = React.useState<string[]>(transaction?.linkedSmsId?.split(',').filter(Boolean) || []);
    
    const [batchUpdateInfo, setBatchUpdateInfo] = React.useState<{ client: Client, count: number } | null>(null);
    const [isQuickAddOpen, setIsQuickAddOpen] = React.useState(false);
    
    // A synced transaction's USDT amount should be immutable.
    const isSyncedTx = !!transaction?.hash && transaction?.type === 'Deposit';
    
    const fetchAvailableFunds = React.useCallback(async (clientId: string) => {
        const funds = await getAvailableClientFunds(clientId);
        setAvailableFunds(funds);
    }, []);
    
    const recalculateFinancials = React.useCallback((
        usdAmount: number,
        type: Transaction['type'],
        manualUsdtAmount?: number
    ): Partial<Transaction> => {

        const result: Partial<Transaction> = {};

        if (!cryptoFees) return result;

        result.amount_usd = parseFloat(usdAmount.toFixed(2));
        
        let feePercent = 0;
        let minFee = 0;
        if(type === 'Deposit') {
            feePercent = cryptoFees.buy_fee_percent / 100;
            minFee = cryptoFees.minimum_buy_fee;
        } else {
            feePercent = cryptoFees.sell_fee_percent / 100;
            minFee = cryptoFees.minimum_sell_fee;
        }

        const calculatedFee = usdAmount * feePercent;
        const cryptoFee = Math.max(calculatedFee, minFee);
        
        const initialUsdtAmount = usdAmount - cryptoFee;

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

    }, [cryptoFees]);

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const settingsRef = ref(db, 'settings');

        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });
        const unsubSettings = onValue(settingsRef, (snap) => {
            const settingsData = snap.val();
            if(settingsData) {
                const feesRef = ref(db, 'rate_history/crypto_fees');
                const lastFeeQuery = query(feesRef, orderByChild('timestamp'), limitToLast(1));
                get(lastFeeQuery).then(snapshot => {
                  if (snapshot.exists()) {
                    const data = snapshot.val();
                    const lastEntryKey = Object.keys(data)[0];
                    setCryptoFees(data[lastEntryKey]);
                  }
                });
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
            setSelectedClient(client || null);
            setFormData(formState);
        } else if (!transaction) {
            setFormData(initialFormData);
            setSelectedClient(null);
        }
    }, [transaction, client, isDataLoading]);
    
    React.useEffect(() => {
        return () => {
            if (attachmentPreview) {
                URL.revokeObjectURL(attachmentPreview);
            }
        };
    }, [attachmentPreview]);
    
    React.useEffect(() => {
        if (selectedClient?.id) {
            fetchAvailableFunds(selectedClient.id);
        } else {
            setAvailableFunds([]);
        }
    }, [selectedClient, fetchAvailableFunds]);

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
    
    const handleClientSelect = async (client: Client | null) => {
        setSelectedClient(client);
        setFormData(prev => ({
            ...prev,
            clientId: client?.id || '',
        }));
        setSelectedFundIds([]);
    };
    
    const handleFundSelectionChange = (fundId: string, isSelected: boolean) => {
        const newSelection = isSelected ? [...selectedFundIds, fundId] : selectedFundIds.filter(id => id !== fundId);
        setSelectedFundIds(newSelection);
    };

    // This effect runs whenever the selected funds change to update the form's financials
    React.useEffect(() => {
        const totalUsd = selectedFundIds.reduce((sum, id) => {
            const fund = availableFunds.find(f => f.id === id);
            return sum + (fund?.amountUsd || 0);
        }, 0);

        setFormData(currentFormData => {
            const updates = recalculateFinancials(totalUsd, currentFormData.type);
            return { ...currentFormData, amount_usd: totalUsd, ...updates };
        });
    }, [selectedFundIds, availableFunds, recalculateFinancials]);
    
    const handleManualUsdtAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newUsdtAmount = parseFloat(e.target.value) || 0;
        if (isSyncedTx) return;
        setFormData(prev => {
            const updates = recalculateFinancials(prev.amount_usd, prev.type, newUsdtAmount);
            return { ...prev, ...updates };
        });
    };

    const handleFieldChange = (field: keyof Transaction, value: any) => {
        setFormData(prev => {
            let newFormData = { ...prev, [field]: value };
            if(field === 'type') {
                const updates = recalculateFinancials(newFormData.amount_usd, value);
                newFormData = { ...newFormData, ...updates };
            }
            return newFormData;
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        setFormErrors(undefined);

        const formElement = e.target as HTMLFormElement;
        const actionFormData = new FormData(formElement);
        
        actionFormData.set('date', formData.date ? new Date(formData.date).toISOString() : new Date().toISOString());
        actionFormData.set('clientId', formData.clientId || '');
        actionFormData.set('cryptoWalletId', formData.cryptoWalletId || '');
        actionFormData.set('amount_usd', String(formData.amount_usd));
        actionFormData.set('fee_usd', String(formData.fee_usd));
        actionFormData.set('expense_usd', String(formData.expense_usd || 0));
        actionFormData.set('amount_usdt', String(formData.amount_usdt));
        
        selectedFundIds.forEach(id => actionFormData.append('linkedReceiptIds', id));

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
            toast({ title: 'Success', description: 'Transaction saved successfully.'});
            onSuccess(result.transactionId);
            setIsEditMode(false);
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
    
    const readOnly = !isEditMode;

    return (
        <>
            <div style={{ position: 'absolute', left: '-9999px', top: 0, zIndex: -1 }}>
                <div className="w-[420px]">
                    <Invoice ref={invoiceRef} transaction={{...formData, date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString() }} client={selectedClient} />
                </div>
            </div>

            <QuickCashReceiptForm
                client={selectedClient}
                isOpen={isQuickAddOpen}
                setIsOpen={setIsQuickAddOpen}
                onReceiptCreated={() => {
                    if (selectedClient?.id) {
                        fetchAvailableFunds(selectedClient.id);
                    }
                }}
            />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-3">
                     {isSyncedTx && (
                        <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                            <Bot className="h-5 w-5 text-blue-600" />
                            <AlertTitle className="text-blue-800 dark:text-blue-300">Synced Transaction</AlertTitle>
                            <AlertDescription className="text-blue-700 dark:text-blue-400 text-xs">
                                This transaction was synced from the blockchain. The USDT amount is locked. Select the corresponding local cash receipts to complete it.
                            </AlertDescription>
                        </Alert>
                    )}
                    <Card>
                        <CardHeader className="flex flex-row justify-between items-start">
                            <div>
                                <CardTitle>Transaction Details</CardTitle>
                                {transaction?.id && <p className="text-xs text-muted-foreground pt-1">ID: {transaction.id}</p>}
                            </div>
                             {!readOnly && transaction && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditMode(false)}>
                                    <XIcon className="mr-2 h-4 w-4" /> Cancel
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="date">Date and Time</Label>
                                    <Popover>
                                    <PopoverTrigger asChild disabled={readOnly}>
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
                                    <Select name="type" required value={formData.type} onValueChange={(v) => handleFieldChange('type', v)} disabled={readOnly || isSyncedTx}>
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
                                    disabled={readOnly}
                                />
                                {formErrors?.clientId && <p className="text-sm text-destructive">{formErrors.clientId[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>System Crypto Wallet</Label>
                                <BankAccountSelector
                                    accounts={cryptoWallets}
                                    value={formData.cryptoWalletId}
                                    onSelect={(v) => handleFieldChange('cryptoWalletId', v)}
                                    disabled={readOnly}
                                />
                            </div>
                        </CardContent>
                    </Card>
                    
                    {selectedClient && formData.type === 'Deposit' && (
                         <Card>
                             <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle>Available Client Funds</CardTitle>
                                    <CardDescription>Select the cash receipts to be used for this USDT transaction.</CardDescription>
                                </div>
                                {!readOnly && (
                                    <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddOpen(true)}>
                                        <PlusCircle className="mr-2 h-4 w-4" />
                                        Record New Receipt
                                    </Button>
                                )}
                             </CardHeader>
                             <CardContent>
                                 <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                     {availableFunds.length > 0 ? (
                                        availableFunds.map(fund => (
                                            <div key={fund.id} className="flex items-center gap-3 p-2 border rounded-md has-[:checked]:bg-muted">
                                                <Checkbox 
                                                    id={fund.id}
                                                    checked={selectedFundIds.includes(fund.id)}
                                                    onCheckedChange={(checked) => handleFundSelectionChange(fund.id, !!checked)}
                                                    disabled={readOnly}
                                                />
                                                <Label htmlFor={fund.id} className={cn("flex-1", !readOnly && "cursor-pointer")}>
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold">{new Intl.NumberFormat().format(fund.amount)} {fund.currency}</span>
                                                        <span className="text-xs text-muted-foreground">{fund.source}</span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                        <span>From: {fund.senderName}</span>
                                                        <span>{format(new Date(fund.date), 'PP')}</span>
                                                    </div>
                                                </Label>
                                            </div>
                                        ))
                                     ) : (
                                        <p className="text-sm text-muted-foreground text-center p-4">No available funds found for this client.</p>
                                     )}
                                     {formErrors?.linkedReceiptIds && <p className="text-sm text-destructive mt-2">{formErrors.linkedReceiptIds[0]}</p>}
                                 </div>
                             </CardContent>
                         </Card>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Financial Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                             <div className="flex items-center gap-2">
                                <Label className="w-1/3 shrink-0 text-right text-xs">Total Amount (USD)</Label>
                                <Input type="number" step="any" value={formData.amount_usd} readOnly disabled className="bg-muted/50"/>
                            </div>
                             {formErrors?.amount_usd && <p className="text-sm text-destructive text-right">{formErrors.amount_usd[0]}</p>}

                             <Alert variant="default" className="p-3">
                                <AlertDescription className="text-xs space-y-2">
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
                                <Input id="amount_usdt" name="amount_usdt" type="number" step="any" required value={formData.amount_usdt} onChange={handleManualUsdtAmountChange} readOnly={isSyncedTx || readOnly} className={cn((isSyncedTx || readOnly) && "bg-muted/50", isSyncedTx && "font-bold border-blue-400")} />
                            </div>
                        </CardContent>
                        <CardFooter>
                            {isEditMode ? (
                                <Button type="submit" disabled={isSaving} size="sm" className="w-full">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {isSaving ? 'Saving...' : 'Save Transaction'}
                                </Button>
                            ) : (
                                <Button type="button" onClick={() => setIsEditMode(true)} size="sm" className="w-full">
                                    <Pencil className="mr-2 h-4 w-4" /> Edit Transaction
                                </Button>
                            )}
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
                                <Textarea id="notes" name="notes" placeholder="Add any relevant notes..." value={formData.notes || ''} onChange={(e) => handleFieldChange('notes', e.target.value)} rows={2} readOnly={readOnly}/>
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="attachment_url_input">Upload Transaction Image</Label>
                                <Input id="attachment_url_input" name="attachment_url_input" type="file" size="sm" onChange={handleAttachmentChange} disabled={readOnly}/>
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
                                    <Input id="remittance_number" name="remittance_number" value={formData.remittance_number || ''} onChange={(e) => handleFieldChange('remittance_number', e.target.value)} readOnly={readOnly}/>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hash">Crypto Hash</Label>
                                    <Input id="hash" name="hash" value={formData.hash || ''} readOnly />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client_wallet_address">Client Wallet Address</Label>
                                <Input id="client_wallet_address" name="client_wallet_address" value={formData.client_wallet_address || ''} onChange={(e) => handleFieldChange('client_wallet_address', e.target.value)} readOnly={readOnly}/>
                            </div>
                            <div className="space-y-2">
                                <Label>Status</Label>
                                <Select name="status" value={formData.status} onValueChange={(v) => handleFieldChange('status', v as Transaction['status'])} disabled={readOnly}>
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
                 <AlertDialog>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitleComponent>Assign Client to Other Transactions?</AlertDialogTitleComponent>
                            <AlertDialogDescription>
                                We found {batchUpdateInfo.count} other unassigned transaction(s) from this same wallet address.
                                Do you want to assign them all to "{batchUpdateInfo.client.name}"?
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setBatchUpdateInfo(null)}>No, Just This One</AlertDialogCancel>
                            <AlertDialogAction>Yes, Assign All</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}

function ClientSelector({ selectedClient, onSelect, disabled }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; disabled?: boolean; }) {
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
                    disabled={disabled}
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
