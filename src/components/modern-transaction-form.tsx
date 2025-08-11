

'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import type { Client, UnifiedFinancialRecord, CryptoFee, Transaction } from '@/lib/types';
import { getUnifiedClientRecords, createModernTransaction, searchClients, findClientByAddress } from '@/lib/actions';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown, Loader2, Save, ArrowDown, ArrowUp, PlusCircle, Repeat, ClipboardPaste } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Checkbox } from './ui/checkbox';
import { Skeleton } from './ui/skeleton';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';
import { QuickCashPaymentForm } from './quick-cash-payment-form';
import { QuickUsdtReceiptForm } from './quick-usdt-receipt-form';


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Create Transaction</>}
        </Button>
    );
}

function FinancialRecordTable({ title, records, selectedIds, onSelectionChange, type, category }: { title: string, records: UnifiedFinancialRecord[], selectedIds: string[], onSelectionChange: (id: string, selected: boolean) => void, type: 'inflow' | 'outflow', category: 'fiat' | 'crypto' }) {
    if (records.length === 0) {
        return null;
    }

    const iconColor = type === 'inflow' ? 'text-green-600' : 'text-red-600';
    const Icon = type === 'inflow' ? ArrowDown : ArrowUp;

    return (
        <Card className="flex-1">
            <CardHeader>
                <CardTitle className={cn("text-base flex items-center gap-2", iconColor)}>
                    <Icon /> {title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
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
            </CardContent>
        </Card>
    );
}

export function ModernTransactionForm({ initialClients }: { initialClients: Client[] }) {
    const [transactionType, setTransactionType] = React.useState<Transaction['type'] | null>(null);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [records, setRecords] = React.useState<UnifiedFinancialRecord[]>([]);
    const [loadingRecords, setLoadingRecords] = React.useState(false);
    const [selectedRecordIds, setSelectedRecordIds] = React.useState<string[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    const [isQuickReceiptOpen, setIsQuickReceiptOpen] = React.useState(false);
    const [isQuickPaymentOpen, setIsQuickPaymentOpen] = React.useState(false);
    const [isQuickUsdtReceiptOpen, setIsQuickUsdtReceiptOpen] = React.useState(false);

    const { toast } = useToast();

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

    const fetchAvailableFunds = React.useCallback(async (clientId: string) => {
        setLoadingRecords(true);
        const fetchedRecords = await getUnifiedClientRecords(clientId);
        setRecords(fetchedRecords);
        setLoadingRecords(false);
    }, []);

    const handleClientSelect = async (client: Client | null) => {
        setSelectedClient(client);
        setSelectedRecordIds([]);
        if (client) {
            fetchAvailableFunds(client.id);
        } else {
            setRecords([]);
        }
    };

    const handleSelectionChange = (id: string, selected: boolean) => {
        setSelectedRecordIds(prev =>
            selected ? [...prev, id] : prev.filter(recId => recId !== id)
        );
    };

    const calculation = React.useMemo(() => {
        const selected = records.filter(r => selectedRecordIds.includes(r.id));
        
        if (!transactionType) return { totalInflowUSD: 0, totalOutflowUSD: 0, calculatedFee: 0, netResult: 0, netResultCurrency: 'USD' };
        
        const feeConfig = {
            buy_fee: cryptoFees?.buy_fee_percent || 2,
            sell_fee: cryptoFees?.sell_fee_percent || 2,
            min_buy_fee: cryptoFees?.minimum_buy_fee || 1,
            min_sell_fee: cryptoFees?.minimum_sell_fee || 1,
        };
        
        let baseAmountForFee = 0;
        let finalCashOutflow = 0;
        let finalCryptoOutflow = 0;
        let totalInflowUSD = 0;
        let totalOutflowUSD = 0;

        if (transactionType === 'Deposit') {
            const fiatInflows = selected.filter(r => r.type === 'inflow' && r.category === 'fiat');
            baseAmountForFee = fiatInflows.reduce((sum, r) => sum + r.amountUsd, 0);
        } else if (transactionType === 'Withdraw') {
            const cryptoInflows = selected.filter(r => r.type === 'inflow' && r.category === 'crypto');
            baseAmountForFee = cryptoInflows.reduce((sum, r) => sum + r.amountUsd, 0);
        } else if (transactionType === 'Transfer') {
             const fiatInflows = selected.filter(r => r.type === 'inflow' && r.category === 'fiat');
             const cryptoInflows = selected.filter(r => r.type === 'inflow' && r.category === 'crypto');
             baseAmountForFee = fiatInflows.reduce((sum, r) => sum + r.amountUsd, 0) + cryptoInflows.reduce((sum, r) => sum + r.amountUsd, 0);
        }

        totalInflowUSD = selected.filter(r => r.type === 'inflow').reduce((sum, r) => sum + r.amountUsd, 0);
        totalOutflowUSD = selected.filter(r => r.type === 'outflow').reduce((sum, r) => sum + r.amountUsd, 0);

        const feePercent = (transactionType === 'Deposit' ? feeConfig.buy_fee : feeConfig.sell_fee) / 100;
        const minFee = transactionType === 'Deposit' ? feeConfig.min_buy_fee : feeConfig.min_sell_fee;
        
        const calculatedFee = Math.max(baseAmountForFee * feePercent, baseAmountForFee > 0 ? minFee : 0);
        
        const netResult = totalInflowUSD - totalOutflowUSD - calculatedFee;
        const netResultCurrency = transactionType === 'Deposit' ? 'USDT' : (transactionType === 'Withdraw' ? 'USD' : 'USD');


        return { totalInflowUSD, totalOutflowUSD, calculatedFee, netResult, netResultCurrency };
    }, [selectedRecordIds, records, cryptoFees, transactionType]);
    
    const recordCategories = React.useMemo(() => {
        return {
            fiatInflows: records.filter(r => r.type === 'inflow' && r.category === 'fiat'),
            cryptoInflows: records.filter(r => r.type === 'inflow' && r.category === 'crypto'),
            fiatOutflows: records.filter(r => r.type === 'outflow' && r.category === 'fiat'),
            cryptoOutflows: records.filter(r => r.type === 'outflow' && r.category === 'crypto'),
        }
    }, [records]);


    return (
        <form action={async (formData) => {
            if (!selectedClient) {
                toast({ variant: 'destructive', title: 'Error', description: 'Please select a client.' });
                return;
            }
             if (!transactionType) {
                toast({ variant: 'destructive', title: 'Error', description: 'Please select a transaction type.' });
                return;
            }
            formData.set('clientId', selectedClient.id);
            formData.set('type', transactionType);
            selectedRecordIds.forEach(id => formData.append('linkedRecordIds', id));
            
            const result = await createModernTransaction(formData);
            if(result.success) {
                toast({ title: 'Success', description: 'Transaction created successfully.' });
                handleClientSelect(selectedClient); // Refresh records
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        }}>
             <QuickCashReceiptForm
                client={selectedClient}
                isOpen={isQuickReceiptOpen}
                setIsOpen={setIsQuickReceiptOpen}
                onReceiptCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }}
            />
             <QuickCashPaymentForm
                client={selectedClient}
                isOpen={isQuickPaymentOpen}
                setIsOpen={setIsQuickPaymentOpen}
                onPaymentCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }}
            />
             <QuickUsdtReceiptForm
                client={selectedClient}
                isOpen={isQuickUsdtReceiptOpen}
                setIsOpen={setIsQuickUsdtReceiptOpen}
                onReceiptCreated={() => { if (selectedClient?.id) fetchAvailableFunds(selectedClient.id); }}
            />
            <div className="space-y-4">
                {/* Step 1 */}
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Select Transaction Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <RadioGroup
                            value={transactionType || ''}
                            onValueChange={(value) => setTransactionType(value as Transaction['type'])}
                            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
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
                
                {/* Step 2 */}
                {transactionType && (
                <Card>
                    <CardHeader>
                        <CardTitle>Step 2: Select a Client</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ClientSelector onSelect={handleClientSelect} />
                    </CardContent>
                </Card>
                )}

                {/* Step 3 */}
                {selectedClient && (
                    <Card>
                        <CardHeader className="flex-wrap flex-row items-center justify-between gap-2">
                            <div className="space-y-1">
                                <CardTitle>Step 3: Select Financial Records</CardTitle>
                                <CardDescription>Choose the records to link to this transaction.</CardDescription>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                { (transactionType === 'Deposit' || transactionType === 'Transfer') && <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickReceiptOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Record Cash Receipt</Button> }
                                { (transactionType === 'Withdraw' || transactionType === 'Transfer') && <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickUsdtReceiptOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Record USDT Receipt</Button> }
                                { (transactionType === 'Withdraw' || transactionType === 'Transfer') && <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickPaymentOpen(true)}><PlusCircle className="mr-2 h-4 w-4" />Record Cash Payment</Button> }
                                {/* Add USDT Payment button once that form is created */}
                            </div>
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
                                            <FinancialRecordTable title="Client Gives (Fiat)" records={recordCategories.fiatInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="inflow" category="fiat" />
                                            <Card className="flex-1"><CardHeader><CardTitle className="text-base flex items-center gap-2 text-red-600"><ArrowUp/> Client Gets (USDT)</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">USDT payment will be calculated automatically.</p></CardContent></Card>
                                        </>
                                    )}
                                    {transactionType === 'Withdraw' && (
                                        <>
                                            <FinancialRecordTable title="Client Gives (USDT)" records={recordCategories.cryptoInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="inflow" category="crypto" />
                                            <FinancialRecordTable title="Client Gets (Fiat)" records={recordCategories.fiatOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="outflow" category="fiat" />
                                        </>
                                    )}
                                    {transactionType === 'Transfer' && (
                                        <>
                                            <div className="space-y-4">
                                                <FinancialRecordTable title="Client Gives (Fiat)" records={recordCategories.fiatInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="inflow" category="fiat" />
                                                <FinancialRecordTable title="Client Gives (USDT)" records={recordCategories.cryptoInflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="inflow" category="crypto" />
                                            </div>
                                             <div className="space-y-4">
                                                <FinancialRecordTable title="Client Gets (Fiat)" records={recordCategories.fiatOutflows} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="outflow" category="fiat" />
                                                <Card className="flex-1"><CardHeader><CardTitle className="text-base flex items-center gap-2 text-red-600"><ArrowUp/> Client Gets (USDT)</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">USDT payment will be calculated automatically.</p></CardContent></Card>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Step 4 */}
                {selectedRecordIds.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Step 4: Calculations Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
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
                                <p className="font-bold">${calculation.calculatedFee.toFixed(2)}</p>
                            </div>
                            <div className="p-2 border rounded-md bg-muted">
                                <p className="text-xs text-muted-foreground">Net {calculation.netResultCurrency} Result</p>
                                <p className="font-bold text-primary">{calculation.netResult.toFixed(2)} {calculation.netResultCurrency}</p>
                            </div>
                        </CardContent>
                    </Card>
                )}

                 {/* Step 5 */}
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


function ClientSelector({ onSelect }: { onSelect: (client: Client | null) => void; }) {
    const [open, setIsOpen] = React.useState(false);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [inputValue, setInputValue] = React.useState("");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const debounceTimeoutRef = React.useRef<NodeJS.Timeout>();

    const handleSearch = (value: string) => {
        setInputValue(value);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        if (value.length < 2) {
            setSearchResults([]);
            return;
        }
        setIsLoading(true);
        debounceTimeoutRef.current = setTimeout(async () => {
            const results = await searchClients(value);
            setSearchResults(results);
            setIsLoading(false);
        }, 300);
    };

    const handleSelect = (client: Client) => {
        setSelectedClient(client);
        onSelect(client);
        setIsOpen(false);
        setInputValue(client.name);
    };

    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';
    
    const handlePaste = async () => {
        const text = await navigator.clipboard.readText();
        handleSearch(text);
    };

    return (
        <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <div className="relative">
                    <Command>
                         <CommandInput
                            placeholder="Search client by name or phone..."
                            value={inputValue}
                            onValueChange={handleSearch}
                            className="pr-10"
                        />
                    </Command>
                    <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={handlePaste}>
                        <ClipboardPaste className="h-4 w-4" />
                    </Button>
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
