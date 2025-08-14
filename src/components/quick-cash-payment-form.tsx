
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { DialogFooter, DialogClose } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { Client, Account, FiatRate } from '@/lib/types';
import { createCashReceipt, type CashReceiptFormState } from '@/lib/actions/financial-records';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';

interface QuickCashPaymentFormProps {
  client: Client | null;
  onPaymentCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    Record Payment
                </>
            )}
        </Button>
    );
}

export function QuickCashPaymentForm({ client, onPaymentCreated, setIsOpen }: QuickCashPaymentFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  
  const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
  const [fiatRates, setFiatRates] = React.useState<Record<string, FiatRate>>({});
  const [loading, setLoading] = React.useState(true);

  const [state, formAction] = useActionState<CashReceiptFormState, FormData>(createCashReceipt.bind(null, null), undefined);
  
  const [selectedBankAccountId, setSelectedBankAccountId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [amountUsd, setAmountUsd] = React.useState(0);

  React.useEffect(() => {
    setLoading(true);

    const accountsRef = ref(db, 'accounts');
    const unsubAccounts = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allAccountsData: Record<string, Account> = snapshot.val();
        const allAccountsList = Object.keys(allAccountsData).map(key => ({ id: key, ...allAccountsData[key] }));
        setBankAccounts(allAccountsList.filter(acc => !acc.isGroup && acc.type === 'Assets' && acc.currency && acc.currency !== 'USDT'));
      }
      setLoading(false);
    });

    const fiatRatesRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
    const unsubFiat = onValue(fiatRatesRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const lastEntryKey = Object.keys(data)[0];
            const lastEntry = data[lastEntryKey];
            setFiatRates(lastEntry.rates || {});
        }
    });

    return () => {
      unsubAccounts();
      unsubFiat();
    }
  }, []);

  const stateRef = React.useRef<CashReceiptFormState>();
  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        onPaymentCreated();
        setIsOpen(false);
        formRef.current?.reset();
        setSelectedBankAccountId('');
        setAmount('');
        setAmountUsd(0);
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
      stateRef.current = state;
    }
  }, [state, toast, onPaymentCreated, setIsOpen]);
  
  React.useEffect(() => {
        const selectedAccount = bankAccounts.find(acc => acc.id === selectedBankAccountId);
        if (!selectedAccount || !selectedAccount.currency) {
            setAmountUsd(0);
            return;
        }

        const numericAmount = parseFloat(amount);
        if (isNaN(numericAmount)) {
            setAmountUsd(0);
            return;
        }
        
        if (selectedAccount.currency === 'USD') {
            setAmountUsd(numericAmount);
            return;
        }

        const rateInfo = fiatRates[selectedAccount.currency];
        if (rateInfo && rateInfo.clientSell > 0) {
            setAmountUsd(numericAmount / rateInfo.clientSell);
        } else {
            setAmountUsd(0);
        }
    }, [amount, selectedBankAccountId, bankAccounts, fiatRates]);

  if (!client) return null;

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4">
        <input type="hidden" name="type" value="outflow" />
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="recipientName" value={client.name} />
        <input type="hidden" name="amountUsd" value={amountUsd} />
         <input type="hidden" name="date" value={new Date().toISOString()} />
        <div className="space-y-4 py-4">
            <div className="space-y-2">
            <Label htmlFor="bankAccountId">Paid From (Bank Account)</Label>
            <Select name="bankAccountId" required value={selectedBankAccountId} onValueChange={setSelectedBankAccountId} disabled={loading}>
                <SelectTrigger><SelectValue placeholder={loading ? "Loading accounts..." : "Select bank account..."} /></SelectTrigger>
                <SelectContent>
                    {loading ? <SelectItem value="loading" disabled>Loading accounts...</SelectItem> 
                    : bankAccounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                            {account.name} ({account.currency})
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
        </div>
            <div className="space-y-2">
            <Label htmlFor="amount">Amount Paid</Label>
            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
        </div>
        <div className="space-y-2">
            <Label>Equivalent Amount (USD)</Label>
            <Input value={amountUsd > 0 ? amountUsd.toFixed(2) : '0.00'} readOnly disabled />
        </div>
            <div className="space-y-2">
            <Label htmlFor="remittanceNumber">Remittance Number</Label>
            <Input id="remittanceNumber" name="remittanceNumber" placeholder="Optional" />
        </div>
        </div>
        <DialogFooter>
        <DialogClose asChild>
            <Button type="button" variant="secondary">Cancel</Button>
        </DialogClose>
        <SubmitButton />
        </DialogFooter>
    </form>
  );
}

    