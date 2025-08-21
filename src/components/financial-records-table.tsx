
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { createModernTransaction, getUnifiedClientRecords } from '@/lib/actions/transaction';
import { useTransactionProcessor } from '@/hooks/use-transaction-processor';
import type { Client, UnifiedFinancialRecord, CryptoFee, Account } from '@/lib/types';
import { ArrowDown, ArrowUp, Loader2, Save } from 'lucide-react';
import { format } from 'date-fns';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';


function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Create Transaction</>}
        </Button>
    );
}


function TransactionCreator({
    client,
    selectedRecords,
    allAccounts,
    calculation,
    onTransactionCreated,
}: {
    client: Client;
    selectedRecords: UnifiedFinancialRecord[];
    allAccounts: Account[];
    calculation: ReturnType<typeof useTransactionProcessor>['calculation'];
    onTransactionCreated: () => void;
}) {
    const [state, formAction] = useActionState(createModernTransaction, undefined);
    const { toast } = useToast();

    const incomeAccounts = React.useMemo(() => allAccounts.filter(acc => !acc.isGroup && acc.type === 'Income'), [allAccounts]);
    const expenseAccounts = React.useMemo(() => allAccounts.filter(acc => !acc.isGroup && acc.type === 'Expenses'), [allAccounts]);

    React.useEffect(() => {
        if (state?.success) {
            toast({ title: 'Success', description: 'Transaction created successfully.' });
            onTransactionCreated();
        } else if (state?.message) {
            toast({ variant: 'destructive', title: 'Error', description: state.message });
        }
    }, [state, toast, onTransactionCreated]);

    if (selectedRecords.length === 0) {
        return null;
    }
    
    const depositRecords = selectedRecords.filter(r => r.type === 'inflow');
    const withdrawalRecords = selectedRecords.filter(r => r.type === 'outflow');

    return (
        <Card className="mt-6">
            <form action={formAction}>
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="type" value="Transfer" />
                {selectedRecords.map(r => <input key={r.id} type="hidden" name="linkedRecordIds" value={r.id} />)}
                
                <CardHeader>
                    <CardTitle>Create Transaction</CardTitle>
                    <p className="text-sm text-muted-foreground">{selectedRecords.length} records selected.</p>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-semibold text-sm mb-2">Deposits (Client Gives)</h4>
                            {depositRecords.map(r => <p key={r.id} className="text-xs">{r.amount.toLocaleString()} {r.currency}</p>)}
                        </div>
                         <div>
                            <h4 className="font-semibold text-sm mb-2">Withdrawals (Client Gets)</h4>
                            {withdrawalRecords.map(r => <p key={r.id} className="text-xs">{r.amount.toLocaleString()} {r.currency}</p>)}
                        </div>
                    </div>
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center pt-4 border-t">
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
                     {Math.abs(calculation.difference) > 0.01 && (
                        <div className="pt-4 border-t mt-4">
                             <Label className="font-semibold">How should this difference of ${Math.abs(calculation.difference).toFixed(2)} be recorded?</Label>
                            {calculation.difference > 0.01 ? (
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
                     <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea id="notes" name="notes" placeholder="Add any relevant notes for this consolidated transaction..." />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </form>
        </Card>
    );
}

export function FinancialRecordsTable({ client, onTransactionCreated }: { client: Client; onTransactionCreated: () => void; }) {
    const [records, setRecords] = React.useState<UnifiedFinancialRecord[]>([]);
    const [loadingRecords, setLoadingRecords] = React.useState(true);
    const [allAccounts, setAllAccounts] = React.useState<Account[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | null>(null);
    const [selectedRecordIds, setSelectedRecordIds] = React.useState<string[]>([]);
    
    const { calculation } = useTransactionProcessor({
        selectedRecordIds,
        records,
        cryptoFees,
        transactionType: 'Transfer', // Use 'Transfer' as a generic type for calculations
    });

    React.useEffect(() => {
        const fetchClientData = async (clientId: string) => {
            setLoadingRecords(true);
            const fetchedRecords = await getUnifiedClientRecords(clientId);
            setRecords(fetchedRecords);
            setSelectedRecordIds([]);
            setLoadingRecords(false);
        };

        if (client.id) {
            fetchClientData(client.id);
        }

        const accountsRef = ref(db, 'accounts');
        const feesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));

        const unsubAccounts = onValue(accountsRef, (snapshot) => {
            if (snapshot.exists()) {
                const allAccountsData: Record<string, Account> = snapshot.val();
                setAllAccounts(Object.values(allAccountsData));
            }
        });

        const unsubFees = onValue(feesRef, (snapshot) => {
            if (snapshot.exists()) {
                setCryptoFees(Object.values(snapshot.val())[0]);
            }
        });

        return () => {
            unsubAccounts();
            unsubFees();
        };
    }, [client]);

    const handleSelectAll = (checked: boolean) => {
        setSelectedRecordIds(checked ? records.map(r => r.id) : []);
    };
    
    const handleSelectionChange = (id: string, selected: boolean) => {
        setSelectedRecordIds(prev =>
            selected ? [...prev, id] : prev.filter(recId => recId !== id)
        );
    };

    return (
        <div>
            <Card>
                <CardHeader>
                    <CardTitle>Financial Records</CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingRecords ? (
                         <Skeleton className="h-48 w-full" />
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                         <TableHead className="w-12">
                                            <Checkbox
                                                checked={selectedRecordIds.length === records.length && records.length > 0}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Category</TableHead>
                                        <TableHead className="text-right">Amount</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {records.length > 0 ? (
                                        records.map(record => (
                                            <TableRow key={record.id}>
                                                <TableCell>
                                                    <Checkbox
                                                        checked={selectedRecordIds.includes(record.id)}
                                                        onCheckedChange={(checked) => handleSelectionChange(record.id, !!checked)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-xs">{format(new Date(record.date), 'PP')}</TableCell>
                                                <TableCell>
                                                     <span className={cn('flex items-center gap-1 text-xs', record.type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                                                        {record.type === 'inflow' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                                                        {record.type}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="capitalize text-xs">{record.category}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">{record.amount.toLocaleString()} {record.currency}</TableCell>
                                                <TableCell><Badge variant="outline" className="capitalize text-xs font-normal">{record.status}</Badge></TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="h-24 text-center">No records found for this client.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {selectedRecordIds.length > 0 && (
                <TransactionCreator
                    client={client}
                    selectedRecords={records.filter(r => selectedRecordIds.includes(r.id))}
                    allAccounts={allAccounts}
                    calculation={calculation}
                    onTransactionCreated={onTransactionCreated}
                />
            )}
        </div>
    );
}

