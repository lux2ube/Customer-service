

'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, Account, FiatRate } from '@/lib/types';
import { createUsdtManualReceipt, type UsdtManualReceiptState } from '@/lib/actions/financial-records';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { useFormHotkeys } from '@/hooks/use-form-hotkeys';

interface QuickUsdtReceiptFormProps {
  client: Client | null;
  onReceiptCreated: () => void;
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
                    Record Receipt
                </>
            )}
        </Button>
    );
}

export function QuickUsdtReceiptForm({ client, onReceiptCreated, setIsOpen }: QuickUsdtReceiptFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  useFormHotkeys(formRef);
  
  const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [state, formAction] = useActionState<UsdtManualReceiptState, FormData>(createUsdtManualReceipt.bind(null, null), undefined);
  
  React.useEffect(() => {
    setLoading(true);

    const accountsRef = ref(db, 'accounts');
    const unsubAccounts = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allAccountsData: Record<string, Account> = snapshot.val();
        const allAccountsList = Object.keys(allAccountsData).map(key => ({ id: key, ...allAccountsData[key] }));
        setCryptoWallets(allAccountsList.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
      }
      setLoading(false);
    });

    return () => unsubAccounts();
  }, []);

  const stateRef = React.useRef<UsdtManualReceiptState>();
  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        onReceiptCreated();
        setIsOpen(false);
        formRef.current?.reset();
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
      stateRef.current = state;
    }
  }, [state, toast, onReceiptCreated, setIsOpen]);

  if (!client) return null;

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4">
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="clientName" value={client.name} />
        <input type="hidden" name="date" value={new Date().toISOString()} />
        <div className="space-y-4 py-4">
            <div className="space-y-2">
            <Label htmlFor="cryptoWalletId">Received In (System Wallet)</Label>
            <Select name="cryptoWalletId" required disabled={loading}>
                <SelectTrigger><SelectValue placeholder={loading ? "Loading wallets..." : "Select system wallet..."} /></SelectTrigger>
                <SelectContent>
                    {loading ? <SelectItem value="loading" disabled>Loading...</SelectItem> 
                    : cryptoWallets.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                            {account.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {state?.errors?.cryptoWalletId && <p className="text-sm text-destructive">{state.errors.cryptoWalletId[0]}</p>}
        </div>
            <div className="space-y-2">
            <Label htmlFor="amount">Amount (USDT)</Label>
            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 500.00" autoFocus/>
            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
        </div>
            <div className="space-y-2">
            <Label htmlFor="txid">Transaction Hash (TxID)</Label>
            <Input id="txid" name="txid" placeholder="Optional" />
        </div>
        </div>
        <DialogFooter>
        <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
        <SubmitButton />
        </DialogFooter>
    </form>
  );
}
