
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import type { Client, UnifiedFinancialRecord, CryptoFee, Transaction, Account, ServiceProvider } from '@/lib/types';
import { createModernTransaction, searchClients, getUnifiedClientRecords } from '@/lib/actions';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown, Loader2, Save, ArrowDown, ArrowUp, PlusCircle, Repeat, ClipboardPaste, Send, X, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Checkbox } from './ui/checkbox';
import { Skeleton } from './ui/skeleton';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { QuickAddCashInflow } from './quick-add-cash-inflow';
import { QuickAddUsdtOutflow } from './quick-add-usdt-outflow';
import { QuickAddUsdtInflow } from './quick-add-usdt-inflow';
import { QuickAddCashOutflow } from './quick-add-cash-outflow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useSearchParams } from 'next/navigation';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Create Transaction</>}
        </Button>
    );
}

function FinancialRecordTable({ records, selectedIds, onSelectionChange }: { records: UnifiedFinancialRecord[], selectedIds: string[], onSelectionChange: (id: string, selected: boolean) => void }) {
    if (records.length === 0) {
        return <p className="text-xs text-muted-foreground text-center p-4 border rounded-md">No available records.</p>;
    }

    return (
        <div className="space-y-2">
            {records.map(record => (
                <div key={record.id} className="flex items-center gap-3 p-2 border rounded-md has-[:checked]:bg-muted has-[:checked]:border-primary">
                    <Checkbox
                        id={record.id}
                        checked={selectedIds.includes(record.id)}
                        onCheckedChange={(checked) => onSelectionChange(record.id, !!checked)}
                    />
                    <Label htmlFor={record.id} className="flex-1 cursor-pointer w-full">
                        <div className="flex justify-between items-center text-sm">
                            <span className="font-semibold">{record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {record.currency}</span>
                            <span className="text-xs text-muted-foreground">{record.source}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                            <span>{format(new Date(record.date), 'PP')}</span>
                            <span className="truncate max-w-[100px]">{record.bankAccountName || record.cryptoWalletName}</span>
                        </div>
                    </Label>
                </div>
            ))}
        </div>
    );
}

export function ModernTransactionForm({ initialClients, allAccounts, serviceProviders, defaultRecordingAccountId }: { initialClients: Client[], allAccounts: Account[], serviceProviders: ServiceProvider[], defaultRecordingAccountId: string }) {
    const searchParams = useSearchParams();
    const [state, formAction] = useActionState(createModernTransaction, undefined);
    
    const [transactionType, setTransactionType] = React.useState<Transaction['type'] | null>(null);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [records, setRecords] = React.useState<UnifiedFinancialRecord[]>([]);
    const [loadingRecords, setLoadingRecords] = React.useState(false);
    const [selectedRecordIds, setSelectedRecordIds] = React.useState<string[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    
    const [isQuickAddCashInOpen, setIsQuickAddCashInOpen] = React.useState(false);
    const [isQuickAddUsdtOutOpen, setIsQuickAddUsdtOutOpen] = React.useState(false);
    const [isQuickAddUsdtInOpen, setIsQuickAddUsdtInOpen] = React.useState(false);
    const [isQuickAddCashOutOpen, setIsQuickAddCashOutOpen] = React.useState(false);
    
    const [autoProcessData, setAutoProcessData] = React.useState<{amount: number, address?: string} | null>(null);


    const { toast } = useToast();

    const usdtAccounts = React.useMemo(() => allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'), [allAccounts]);
    const incomeAccounts = React.useMemo(() => allAccounts.filter(acc => !acc.isGroup && acc.type === 'Income'), [allAccounts]);
    const expenseAccounts = React.useMemo(() => allAccounts.filter(acc => !acc.isGroup && acc.type === 'Expenses'), [allAccounts]);

    const fetchAvailableFunds = React.useCallback(async (clientId: string) => {
        setLoadingRecords(true);
        const fetchedRecords = await getUnifiedClientRecords(clientId);
        setRecords(fetchedRecords);
        setLoadingRecords(false);
        return fetchedRecords;
    }, []);

    const handleClientSelect = React.useCallback((client: Client | null) => {
        setSelectedClient(client);
        setSelectedRecordIds([]);
        if (client) {
            fetchAvailableFunds(client.id);
        } else {
            setRecords([]);
        }
    }, [fetchAvailableFunds]);


    React.useEffect(() => {
        const feesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));
        const unsubFees = onValue(feesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                setCryptoFees(data[lastEntryKey]);
            }
        });
        return () => unsubFees();
    }, []);

    React.useEffect(() => {
        if (state?.success) {
            toast({ title: 'Success', description: 'Transaction created successfully.' });
            if (selectedClient) {
                handleClientSelect(selectedClient); // Re-fetch records and reset selections
            }
        } else if (state?.message) {
            toast({ variant: 'destructive', title: 'Error', description: state.message });
        }
    }, [state, toast, selectedClient, handleClientSelect]);


    React.useEffect(() => {
        const typeParam = searchParams.get('type') as Transaction['type'] | null;
        const clientIdParam = searchParams.get('clientId');
        const recordIdsParam = searchParams.get('linkedRecordIds');

        if (typeParam) {
            setTransactionType(typeParam);
        }
        if (clientIdParam) {
            const client = initialClients.find(c => c.id === clientIdParam);
            if (client) {
                handleClientSelect(client);
            }
        }
        if (recordIdsParam) {
            setSelectedRecordIds(recordIdsParam.split(','));
        }
    }, [searchParams, initialClients, handleClientSelect]);


    const handleSelectionChange = (id: string, selected: boolean) => {
        setTimeout(() => {
            setSelectedRecordIds(prev =>
                selected ? [...prev, id] : prev.filter(recId => recId !== id)
            );
        }, 0);
    };

    const calculation = React.useMemo(() => {
        const selected = records.filter(r => selectedRecordIds.includes(r.id));
        if (!transactionType || !cryptoFees) {
            return { totalInflowUSD: 0, totalOutflowUSD: 0, fee: 0, difference: 0 };
        }

        const totalInflowUSD = selected.filter(r => r.type === 'inflow').reduce((sum, r) => sum + (r.amount_usd || 0), 0);
        const totalOutflowUSD = selected.filter(r => r.type === 'outflow').reduce((sum, r) => sum + (r.amount_usd || 0), 0);
        
        let fee = 0;

        if (transactionType === 'Deposit') {
            const usdtOutflow = selected.filter(r => r.type === 'outflow' && r.category === 'crypto').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.buy_fee_percent || 0) / 100;
            fee = Math.max(usdtOutflow * feePercent, usdtOutflow > 0 ? (cryptoFees.minimum_buy_fee || 0) : 0);
        } else if (transactionType === 'Withdraw') {
            const usdtInflow = selected.filter(r => r.type === 'inflow' && r.category === 'crypto').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.sell_fee_percent || 0) / 100;
            fee = Math.max(usdtInflow * feePercent, usdtInflow > 0 ? (cryptoFees.minimum_sell_fee || 0) : 0);
        } else if (transactionType === 'Transfer') {
            const usdtMovement = selected.filter(r => r.category === 'crypto').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.buy_fee_percent || 0) / 100; // Use a default fee for transfers, e.g., buy fee
            fee = usdtMovement * feePercent;
        }

        const difference = (totalOutflowUSD + fee) - totalInflowUSD;
        
        return { totalInflowUSD, totalOutflowUSD, fee, difference };
    }, [selectedRecordIds, records, cryptoFees, transactionType]);
    
    const recordCategories = React.useMemo(() => {
        return {
            fiatInflows: records.filter(r => r.type === 'inflow' && r.category === 'fiat'),
            cryptoInflows: records.filter(r => r.type === 'inflow' && r.category === 'crypto'),
            fiatOutflows: records.filter(r => r.type === 'outflow' && r.category === 'fiat'),
            cryptoOutflows: records.filter(r => r.type === 'outflow' && r.category === 'crypto'),
        }
    }, [records]);

    const handleAutoProcess = () => {
        const selectedFiatInflows = records.filter(r => selectedRecordIds.includes(r.id) && r.type === 'inflow' && r.category === 'fiat');
        const totalFiatInflowUsd = selectedFiatInflows.reduce((sum, r) => sum + (r.amount_usd || 0), 0);
        
        if (totalFiatInflowUsd <= 0 || !cryptoFees) {
            toast({
                variant: 'destructive',
                title: 'No Fiat Inflow Selected',
                description: 'Please select one or more cash/fiat inflow records to auto-process.'
            });
            return;
        }
        
        const feePercent = (cryptoFees.buy_fee_percent || 0) / 100;
        const minFee = cryptoFees.minimum_buy_fee || 0;

        let fee = 0;
        let usdtAmount = 0;

        if ((1 + feePercent) > 0) {
            fee = (totalFiatInflowUsd * feePercent) / (1 + feePercent);
            if (totalFiatInflowUsd > 0 && fee < minFee) {
                fee = minFee;
            }
            usdtAmount = totalFiatInflowUsd - fee;
        } else {
            usdtAmount = totalFiatInflowUsd;
        }

        const clientHasAddress = selectedClient?.serviceProviders?.some(p => p.providerType === 'Crypto' && p.details.Address);
        const latestAddress = clientHasAddress ? selectedClient.serviceProviders.find(p => p.providerType === 'Crypto' && p.details.Address)?.details.Address : undefined;

        setAutoProcessData({ amount: usdtAmount, address: latestAddress });
        setIsQuickAddUsdtOutOpen(true);
    };
    
    const onAutoProcessSuccess = async (newRecordId: string) => {
        if (!selectedClient) return;
        await fetchAvailableFunds(selectedClient.id);
        setSelectedRecordIds(prev => [...prev, newRecordId]);
    };

    return (
        <form action={formAction}>
            <QuickAddCashInflow client={selectedClient} isOpen={isQuickAddCashInOpen} setIsOpen={setIsQuickAddCashInOpen} onRecordCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }} />
            <QuickAddUsdtOutflow client={selectedClient} usdtAccounts={usdtAccounts} serviceProviders={serviceProviders || []} defaultRecordingAccountId={defaultRecordingAccountId} isOpen={isQuickAddUsdtOutOpen} setIsOpen={setIsQuickAddUsdtOutOpen} onRecordCreated={onAutoProcessSuccess} autoProcessData={autoProcessData} onDialogClose={() => setAutoProcessData(null)} />
            <QuickAddUsdtInflow client={selectedClient} isOpen={isQuickAddUsdtInOpen} setIsOpen={setIsQuickAddUsdtInOpen} onRecordCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }} />
            <QuickAddCashOutflow client={selectedClient} isOpen={isQuickAddCashOutOpen} setIsOpen={setIsQuickAddCashOutOpen} onRecordCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }} />

            <div className="space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Select Transaction Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup
                            value={transactionType || ''}
                            onValueChange={(value) => setTransactionType(value as any)}
                            className="grid grid-cols-1 md:grid-cols-3 gap-4"
                        >
                             <div>
                                <RadioGroupItem value="Deposit" id="type-deposit" className="peer sr-only" />
                                <Label htmlFor="type-deposit" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                    <ArrowDown className="mb-3 h-6 w-6" />
                                    Deposit (Client Buys USDT)
                                </Label>
                             </div>
                              <div>
                                <RadioGroupItem value="Withdraw" id="type-withdraw" className="peer sr-only" />
                                <Label htmlFor="type-withdraw" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                    <ArrowUp className="mb-3 h-6 w-6" />
                                    Withdraw (Client Sells USDT)
                                </Label>
                             </div>
                             <div>
                                <RadioGroupItem value="Transfer" id="type-transfer" className="peer sr-only" />
                                <Label htmlFor="type-transfer" className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                    <Repeat className="mb-3 h-6 w-6" />
                                    Internal Transfer
                                </Label>
                             </div>
                        </RadioGroup>
                    </CardContent>
                </Card>
                
                {transactionType && (
                <Card>
                    <CardHeader>
                        <CardTitle>Step 2: Select a Client</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ClientSelector onSelect={handleClientSelect} selectedClient={selectedClient} />
                    </CardContent>
                </Card>
                )}

                {selectedClient && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Step 3: Link Financial Records</CardTitle>
                            <CardDescription>Select records to consolidate into this transaction.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingRecords ? (
                                <div className="flex gap-4">
                                    <Skeleton className="h-48 w-full" />
                                    <Skeleton className="h-48 w-full" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {transactionType === 'Deposit' && (
                                        <>
                                            <div className="space-y-2">
                                                 <div className="flex justify-between items-center mb-2">
                                                    <Label>Client Gives (Fiat)</Label>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddCashInOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Add</Button>
                                                </div>
                                                <FinancialRecordTable records={recordCategories.fiatInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                            </div>
                                             <div className="space-y-2">
                                                 <div className="flex justify-between items-center mb-2">
                                                    <Label>Client Gets (USDT)</Label>
                                                    <div className="flex items-center gap-2">
                                                        <Button type="button" variant="outline" size="sm" onClick={handleAutoProcess}><Bot className="mr-2 h-4 w-4" />Auto Process</Button>
                                                        <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddUsdtOutOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Add</Button>
                                                    </div>
                                                </div>
                                                 <FinancialRecordTable records={recordCategories.cryptoOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                             </div>
                                        </>
                                    )}
                                    {transactionType === 'Withdraw' && (
                                        <>
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <Label>Client Gives (USDT)</Label>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddUsdtInOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Add</Button>
                                                </div>
                                                <FinancialRecordTable records={recordCategories.cryptoInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <Label>Client Gets (Fiat)</Label>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickAddCashOutOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Add</Button>
                                                </div>
                                                <FinancialRecordTable records={recordCategories.fiatOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                            </div>
                                        </>
                                    )}
                                    {transactionType === 'Transfer' && (
                                        <>
                                            <div className="space-y-4">
                                                <FinancialRecordTable records={recordCategories.fiatInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                                <FinancialRecordTable records={recordCategories.cryptoInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                            </div>
                                             <div className="space-y-4">
                                                <FinancialRecordTable records={recordCategories.fiatOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                                <FinancialRecordTable records={recordCategories.cryptoOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}


                {selectedRecordIds.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Step 4: Calculations Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div className="p-2 border rounded-md">
                                    <p className="text-xs text-muted-foreground">Total Inflow</p>
                                    <p className="font-bold text-green-600">${calculation.totalInflowUSD.toFixed(2)}</p>
                                </div>
                                <div className="p-2 border rounded-md">
                                    <p className="text-xs text-muted-foreground">Total Outflow</p>
                                    <p className="font-bold text-red-600">${calculation.totalOutflowUSD.toFixed(2)}</p>
                                </div>
                                <div className="p-2 border rounded-md">
                                    <p className="text-xs text-muted-foreground">Fee</p>
                                    <p className="font-bold">${calculation.fee.toFixed(2)}</p>
                                </div>
                                <div className={cn("p-2 border rounded-md", calculation.difference.toFixed(2) !== '0.00' ? 'border-amber-500 bg-amber-50' : '')}>
                                    <p className="text-xs text-muted-foreground">Difference</p>
                                    <p className="font-bold">${calculation.difference.toFixed(2)}</p>
                                </div>
                            </div>
                             <p className="text-xs text-muted-foreground pt-2">
                                Formula: (Outflow + Fee) - Inflow = Difference.
                            </p>
                            {Math.abs(calculation.difference) > 0.01 && (
                                <div className="pt-4 border-t mt-4">
                                     <Label className="font-semibold">How should this difference of ${Math.abs(calculation.difference).toFixed(2)} be recorded?</Label>
                                    {calculation.difference < -0.01 ? (
                                        <RadioGroup name="differenceHandling" defaultValue="income" className="mt-2 space-y-2">
                                            <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="income" id="diff-income" />
                                                <Label htmlFor="diff-income" className="font-normal">Record as Income (Gain)</Label>
                                            </div>
                                            <Select name="incomeAccountId">
                                                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Select income account..." /></SelectTrigger>
                                                <SelectContent>
                                                    {incomeAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </RadioGroup>
                                    ) : (
                                         <RadioGroup name="differenceHandling" defaultValue="expense" className="mt-2 space-y-2">
                                             <div className="flex items-center space-x-2">
                                                <RadioGroupItem value="expense" id="diff-expense" />
                                                <Label htmlFor="diff-expense" className="font-normal">Record as an Expense/Discount</Label>
                                            </div>
                                             <Select name="expenseAccountId">
                                                <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Select expense account..." /></SelectTrigger>
                                                <SelectContent>
                                                    {expenseAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
                                                </SelectContent>
                                            </Select>
                                        </RadioGroup>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                 {selectedRecordIds.length > 0 && (
                    <Card>
                        <CardHeader><CardTitle>Step 5: Final Details</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                             <div className="space-y-2">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea id="notes" name="notes" placeholder="Add any relevant notes for this consolidated transaction..." />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="attachment">Attachment</Label>
                                <Input id="attachment" name="attachment" type="file" />
                            </div>
                        </CardContent>
                        <CardFooter className="flex justify-end">
                            <SubmitButton />
                        </CardFooter>
                    </Card>
                 )}
            </div>
        </form>
    );
}


function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [open, setIsOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState(selectedClient?.name || "");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    
    const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

     React.useEffect(() => {
        if(selectedClient) {
            setInputValue(selectedClient.name);
            setIsOpen(false);
        } else {
            setInputValue("");
        }
    }, [selectedClient]);

    React.useEffect(() => {
        if (selectedClient) {
            setSearchResults([]);
            return;
        };

        if (inputValue.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(async () => {
            const results = await searchClients(inputValue);
            setSearchResults(results);
            setIsLoading(false);
            if (results.length > 0) {
              setIsOpen(true);
            }
        }, 300);

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [inputValue, selectedClient]);

    const handleSelect = (client: Client) => {
        onSelect(client);
        setIsOpen(false);
        setInputValue(client.name);
    };
    
    const handleClear = () => {
        onSelect(null);
        setInputValue('');
    };

    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(' ') : phone || '';
    
    const handlePaste = async () => {
        const text = await navigator.clipboard.readText();
        setInputValue(text);
    };

    return (
         <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <div className="relative w-full">
                    <Command>
                        <CommandInput
                            placeholder="Search client by name, phone, or paste address..."
                            value={inputValue}
                            onValueChange={setInputValue}
                            className="pr-16"
                            disabled={!!selectedClient}
                        />
                    </Command>
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
                        {selectedClient ? (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear}>
                                <X className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={handlePaste}>
                                <ClipboardPaste className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && searchResults.length === 0 && inputValue.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => handleSelect(client)}>
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

    
