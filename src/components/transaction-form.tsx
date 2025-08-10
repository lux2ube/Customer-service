
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Calendar as CalendarIcon, Save, Download, Loader2, Share2, Check, ChevronsUpDown, Bot, PlusCircle, Pencil, XIcon } from 'lucide-react';
import React from 'react';
import { createTransaction, type TransactionFormState, searchClients, getAvailableClientFunds } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Textarea } from './ui/textarea';
import type { Client, Account, Transaction, CryptoFee, UnifiedReceipt } from '@/lib/types';
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
  AlertDialogTitle as AlertDialogTitleComponent,
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

export function TransactionForm({ transaction, client }: { transaction?: Transaction | null, client?: Client | null }) {
    const { toast } = useToast();
    const router = useRouter();
    
    const [isSaving, setIsSaving] = React.useState(false);
    const [isDataLoading, setIsDataLoading] = React.useState(true);
    const [isDownloading, setIsDownloading] = React.useState(false);
    const [isSharing, setIsSharing] = React.useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = React.useState(false);
    
    const [formData, setFormData] = React.useState<Transaction>(transaction || initialFormData);
    const [formErrors, setFormErrors] = React.useState<TransactionFormState['errors']>();
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(client || null);
    
    const [attachmentToUpload, setAttachmentToUpload] = React.useState<File | null>(null);
    const [attachmentPreview, setAttachmentPreview] = React.useState<string | null>(null);
    const invoiceRef = React.useRef<HTMLDivElement>(null);
    
    const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    const [availableFunds, setAvailableFunds] = React.useState<UnifiedReceipt[]>([]);
    
    const [selectedFundIds, setSelectedFundIds] = React.useState<string[]>([]);
    
    const isSyncedTx = !!(transaction?.hash && transaction?.type === 'Withdraw');

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const feesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));

        const unsubAccounts = onValue(accountsRef, (snap) => {
            const allAccounts: Account[] = snap.val() ? Object.keys(snap.val()).map(key => ({ id: key, ...snap.val()[key] })) : [];
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency === 'USDT'));
        });

        const unsubFees = onValue(feesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                setCryptoFees(data[lastEntryKey]);
            }
        });
        
        Promise.all([ get(accountsRef), get(feesRef) ]).then(() => {
            setIsDataLoading(false);
        });

        return () => { unsubAccounts(); unsubFees(); };
    }, []);

    const fetchAvailableFunds = React.useCallback(async (clientId: string) => {
        const funds = await getAvailableClientFunds(clientId);
        setAvailableFunds(funds);
        return funds;
    }, []);

    React.useEffect(() => {
        const initializeForm = async () => {
            if (transaction) {
                setFormData({ ...initialFormData, ...transaction });
                setSelectedClient(client || null);
                const initialFundIds = transaction.linkedSmsId?.split(',').filter(Boolean) || [];
                setSelectedFundIds(initialFundIds);
                if (client?.id) {
                    await fetchAvailableFunds(client.id);
                }
            } else {
                setFormData(initialFormData);
                setSelectedClient(null);
                setSelectedFundIds([]);
                setAvailableFunds([]);
            }
        };
        initializeForm();
    }, [transaction, client, fetchAvailableFunds]);

    const recalculateFinancials = React.useCallback((usdAmount: number, type: Transaction['type']): Partial<Pick<Transaction, 'fee_usd' | 'amount_usdt'>> => {
        if (isSyncedTx) {
            return { fee_usd: 0, amount_usdt: formData.amount_usdt };
        }
        if (!cryptoFees) return {};

        if (usdAmount <= 0) {
            return { fee_usd: 0, amount_usdt: 0, expense_usd: 0 };
        }

        const feePercent = type === 'Deposit' ? cryptoFees.buy_fee_percent / 100 : cryptoFees.sell_fee_percent / 100;
        const minFee = type === 'Deposit' ? cryptoFees.minimum_buy_fee : cryptoFees.minimum_sell_fee;
        
        const calculatedFee = Math.max(usdAmount * feePercent, minFee);
        const finalUsdtAmount = usdAmount - calculatedFee;

        return {
            fee_usd: parseFloat(calculatedFee.toFixed(2)),
            amount_usdt: parseFloat(finalUsdtAmount.toFixed(2)),
        };
    }, [cryptoFees, isSyncedTx, formData.amount_usdt]);

    React.useEffect(() => {
        const totalUsdFromFunds = selectedFundIds.reduce((sum, id) => {
            const fund = availableFunds.find(f => f.id === id);
            return sum + (fund?.amountUsd || 0);
        }, 0);
        
        setFormData(prev => {
             const updates = recalculateFinancials(totalUsdFromFunds, prev.type);
             return { ...prev, amount_usd: totalUsdFromFunds, ...updates, expense_usd: 0 };
        });

    }, [selectedFundIds, availableFunds, recalculateFinancials]);

    const handleFieldChange = (field: keyof Transaction, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleManualUsdtChange = (newUsdtValue: number) => {
        if (isSyncedTx) return;
        setFormData(prev => {
            if (!cryptoFees) return { ...prev, amount_usdt: newUsdtValue };

            const { fee_usd: originalFee = 0, amount_usdt: originalUsdt = 0 } = recalculateFinancials(prev.amount_usd, prev.type);

            const difference = newUsdtValue - originalUsdt;
            
            return {
                ...prev,
                amount_usdt: newUsdtValue,
                fee_usd: originalFee,
                expense_usd: difference,
            };
        });
    };
    
    const handleClientSelect = async (newClient: Client | null) => {
        setSelectedClient(newClient);
        setFormData(prev => ({
            ...prev,
            clientId: newClient?.id || '',
        }));
        setSelectedFundIds([]);
        if (newClient) {
            fetchAvailableFunds(newClient.id);
        } else {
            setAvailableFunds([]);
        }
    };
    
    const handleFundSelectionChange = (fundId: string, isSelected: boolean) => {
        const newSelection = isSelected ? [...selectedFundIds, fundId] : selectedFundIds.filter(id => id !== fundId);
        setSelectedFundIds(newSelection);
    };

    const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setAttachmentToUpload(file);
            if (attachmentPreview) URL.revokeObjectURL(attachmentPreview);
            if (file.type.startsWith('image/')) setAttachmentPreview(URL.createObjectURL(file));
            else setAttachmentPreview(null);
        } else {
            setAttachmentToUpload(null);
            setAttachmentPreview(null);
        }
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
        actionFormData.set('type', formData.type);
        actionFormData.set('status', formData.status);
        
        selectedFundIds.forEach(id => actionFormData.append('linkedReceiptIds', id));

        if(attachmentToUpload) actionFormData.set('attachment_url_input', attachmentToUpload);

        if (formData.status === 'Confirmed' && invoiceRef.current) {
            try {
                const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true, backgroundColor: null });
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) actionFormData.set('invoice_image', new File([blob], 'invoice.png', { type: 'image/png' }));
            } catch (error) {
                console.error("Failed to generate invoice image:", error);
                toast({ variant: 'destructive', title: 'Invoice Generation Failed', description: 'Could not create invoice image. The transaction will be saved without it.' });
            }
        }

        const result = await createTransaction(transaction?.id || null, actionFormData);
        
        if (result?.success && result.transactionId) {
            toast({ title: 'Success', description: 'Transaction saved successfully.'});
            if (transaction?.id) {
                 router.push('/transactions');
            } else {
                 router.push(`/transactions/${result.transactionId}/edit`);
            }
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
                onReceiptCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }}
            />

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-3">
                     {isSyncedTx && (
                        <Alert variant="default" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                            <Bot className="h-5 w-5 text-blue-600" />
                            <AlertTitle className="text-blue-800 dark:text-blue-300">Synced Transaction</AlertTitle>
                            <AlertDescription className="text-blue-700 dark:text-blue-400 text-xs">
                                This is an incoming withdrawal from the blockchain. The USDT amount is locked.
                            </AlertDescription>
                        </Alert>
                    )}
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
                                    <Select name="type" required value={formData.type} onValueChange={(v) => handleFieldChange('type', v)} disabled={isSyncedTx}>
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
                                <ClientSelector selectedClient={selectedClient} onSelect={handleClientSelect} />
                                {formErrors?.clientId && <p className="text-sm text-destructive">{formErrors.clientId[0]}</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>System Crypto Wallet</Label>
                                <BankAccountSelector accounts={cryptoWallets} value={formData.cryptoWalletId} onSelect={(v) => handleFieldChange('cryptoWalletId', v)} />
                            </div>
                        </CardContent>
                    </Card>
                    
                    {selectedClient && (
                         <Card>
                             <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-1">
                                    <CardTitle>Available Client Funds</CardTitle>
                                    <CardDescription>Select cash receipts to fund this transaction.</CardDescription>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Record New Receipt
                                </Button>
                             </CardHeader>
                             <CardContent>
                                 <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                                     {availableFunds.length > 0 ? (
                                        availableFunds.map(fund => (
                                            <div key={fund.id} className="flex items-center gap-3 p-2 border rounded-md has-[:checked]:bg-muted">
                                                <Checkbox id={fund.id} checked={selectedFundIds.includes(fund.id)} onCheckedChange={(checked) => handleFundSelectionChange(fund.id, !!checked)} />
                                                <Label htmlFor={fund.id} className="flex-1 cursor-pointer">
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
                        <CardHeader><CardTitle>Financial Summary</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                             <div className="flex items-center gap-2">
                                <Label className="w-1/3 shrink-0 text-right text-xs">Total Amount (USD)</Label>
                                <Input type="number" step="any" value={formData.amount_usd} readOnly disabled className="bg-muted/50"/>
                            </div>
                             {formErrors?.amount_usd && <p className="text-sm text-destructive text-right">{formErrors.amount_usd[0]}</p>}

                             <Alert variant="default" className="p-3">
                                <AlertDescription className="text-xs space-y-2">
                                    <div className="flex justify-between items-center"><span>Fee (Calculated):</span><span className="font-mono">{formData.fee_usd?.toFixed(2) || '0.00'} USD</span></div>
                                    <div className="flex justify-between items-center text-red-600"><span>Expense / Discount:</span><span className="font-mono">{formData.expense_usd?.toFixed(2) || '0.00'} USD</span></div>
                                </AlertDescription>
                            </Alert>

                            <div className="flex items-center gap-2">
                                <Label htmlFor="amount_usdt" className="w-1/3 shrink-0 text-right text-xs">Final USDT Amount</Label>
                                <Input id="amount_usdt" name="amount_usdt" type="number" step="any" required value={formData.amount_usdt} onChange={(e) => handleManualUsdtChange(parseFloat(e.target.value))} disabled={isSyncedTx} className={cn(isSyncedTx && "bg-muted/50", isSyncedTx && "font-bold border-blue-400")} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                <div className="md:col-span-1 space-y-3">
                    {transaction && (
                        <Card>
                            <CardHeader><CardTitle>Actions</CardTitle><CardDescription className="text-xs">Download or share the invoice.</CardDescription></CardHeader>
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
                        <CardHeader><CardTitle>Optional Data</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" placeholder="Add any relevant notes..." value={formData.notes || ''} onChange={(e) => handleFieldChange('notes', e.target.value)} rows={2}/></div>
                            <div className="space-y-2"><Label htmlFor="attachment_url_input">Upload Transaction Image</Label><Input id="attachment_url_input" name="attachment_url_input" type="file" size="sm" onChange={handleAttachmentChange}/>
                                {attachmentPreview && (<div className="mt-2"><img src={attachmentPreview} alt="Preview" className="rounded-md max-h-48 w-auto" /></div>)}
                                {!attachmentPreview && transaction?.attachment_url && <a href={transaction.attachment_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">View current attachment</a>}
                            </div>
                            <div className="grid md:grid-cols-2 gap-3">
                                <div className="space-y-2"><Label htmlFor="remittance_number">Remittance Number</Label><Input id="remittance_number" name="remittance_number" value={formData.remittance_number || ''} onChange={(e) => handleFieldChange('remittance_number', e.target.value)}/></div>
                                <div className="space-y-2"><Label htmlFor="hash">Crypto Hash</Label><Input id="hash" name="hash" value={formData.hash || ''} readOnly /></div>
                            </div>
                            <div className="space-y-2"><Label htmlFor="client_wallet_address">Client Wallet Address</Label><Input id="client_wallet_address" name="client_wallet_address" value={formData.client_wallet_address || ''} onChange={(e) => handleFieldChange('client_wallet_address', e.target.value)}/></div>
                            <div className="space-y-2"><Label>Status</Label>
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
                 <CardFooter className="md:col-span-3 flex justify-end p-2">
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {isSaving ? 'Saving...' : 'Save Transaction'}
                    </Button>
                </CardFooter>
            </form>
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
            if (inputValue.trim().length === 0 && selectedClient) onSelect(null);
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
                <Button variant="outline" role="combobox" aria-expanded={isOpen} className="w-full justify-between font-normal">
                    {selectedClient ? selectedClient.name : "Select client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput placeholder="Search by name or phone..." value={inputValue} onValueChange={setInputValue} />
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && inputValue && inputValue.length > 1 && searchResults.length === 0 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={`${client.name} ${getPhone(client.phone)}`} onSelect={() => handleSelect(client)}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col"><span>{client.name}</span><span className="text-xs text-muted-foreground">{getPhone(client.phone)}</span></div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
