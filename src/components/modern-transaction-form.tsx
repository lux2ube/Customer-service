
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import type { Client, UnifiedFinancialRecord, CryptoFee, Transaction } from '@/lib/types';
import { getUnifiedClientRecords, createModernTransaction } from '@/lib/actions';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown, Loader2, Save, ArrowDown, ArrowUp, PlusCircle } from 'lucide-react';
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

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Create Transaction</>}
        </Button>
    );
}

function FinancialRecordTable({ title, records, selectedIds, onSelectionChange, type }: { title: string, records: UnifiedFinancialRecord[], selectedIds: string[], onSelectionChange: (id: string, selected: boolean) => void, type: 'inflow' | 'outflow' }) {
    if (records.length === 0) {
        return (
            <Card className="flex-1">
                <CardHeader>
                    <CardTitle className={cn("text-base flex items-center gap-2", type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                        {type === 'inflow' ? <ArrowDown /> : <ArrowUp />} {title}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground text-center py-8">No records available.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="flex-1">
            <CardHeader>
                <CardTitle className={cn("text-base flex items-center gap-2", type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                    {type === 'inflow' ? <ArrowDown /> : <ArrowUp />} {title}
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
        const inflows = selected.filter(r => r.type === 'inflow');
        const outflows = selected.filter(r => r.type === 'outflow');

        const totalInflowUSD = inflows.reduce((sum, r) => sum + r.amountUsd, 0);
        const totalOutflowUSD = outflows.reduce((sum, r) => sum + r.amountUsd, 0);
        
        if (!transactionType) return { totalInflowUSD: 0, totalOutflowUSD: 0, calculatedFee: 0, netResult: 0 };
        
        const feeConfig = {
            buy_fee: cryptoFees?.buy_fee_percent || 2,
            sell_fee: cryptoFees?.sell_fee_percent || 2,
            min_buy_fee: cryptoFees?.minimum_buy_fee || 1,
            min_sell_fee: cryptoFees?.minimum_sell_fee || 1,
        };
        
        const feePercent = (transactionType === 'Deposit' ? feeConfig.buy_fee : feeConfig.sell_fee) / 100;
        const minFee = transactionType === 'Deposit' ? feeConfig.min_buy_fee : feeConfig.min_sell_fee;
        
        const baseAmountForFee = transactionType === 'Deposit' ? totalInflowUSD : totalOutflowUSD;
        const calculatedFee = Math.max(baseAmountForFee * feePercent, baseAmountForFee > 0 ? minFee : 0);
        
        const netResult = totalInflowUSD - totalOutflowUSD - calculatedFee;

        return { totalInflowUSD, totalOutflowUSD, calculatedFee, netResult };
    }, [selectedRecordIds, records, cryptoFees, transactionType]);

    const inflowRecords = records.filter(r => r.type === 'inflow');
    const outflowRecords = records.filter(r => r.type === 'outflow');

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
                            className="grid grid-cols-2 gap-4"
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
                        <ClientSelector clients={initialClients} selectedClient={selectedClient} onSelect={handleClientSelect} />
                    </CardContent>
                </Card>
                )}

                {/* Step 3 */}
                {selectedClient && (
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <div className="space-y-1">
                                <CardTitle>Step 3: Select Financial Records</CardTitle>
                                <CardDescription>Choose the records to link to this transaction.</CardDescription>
                            </div>
                            {transactionType === 'Deposit' && (
                                <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickReceiptOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Record New Receipt
                                </Button>
                            )}
                            {transactionType === 'Withdraw' && (
                                <Button type="button" variant="outline" size="sm" onClick={() => setIsQuickPaymentOpen(true)}>
                                    <PlusCircle className="mr-2 h-4 w-4" />
                                    Record New Payment
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent>
                            {loadingRecords ? (
                                <div className="flex gap-4">
                                    <Skeleton className="h-48 w-full" />
                                    <Skeleton className="h-48 w-full" />
                                </div>
                            ) : (
                                <div className="flex flex-col md:flex-row gap-4">
                                    <FinancialRecordTable title="Inflows (Client Gives)" records={inflowRecords} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="inflow" />
                                    <FinancialRecordTable title="Outflows (Client Gets)" records={outflowRecords} selectedIds={selectedRecordIds} onSelectionChange={handleSelectionChange} type="outflow" />
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
                                <p className="text-xs text-muted-foreground">Net Result</p>
                                <p className="font-bold text-primary">${calculation.netResult.toFixed(2)} USDT</p>
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


function ClientSelector({ clients, selectedClient, onSelect }: { clients: Client[], selectedClient: Client | null, onSelect: (client: Client | null) => void }) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[300px] justify-between font-normal">
                    {selectedClient ? selectedClient.name : "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                            {clients.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={() => {
                                        onSelect(client);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    {client.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
