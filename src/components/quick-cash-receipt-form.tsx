
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
import type { Client, Account } from '@/lib/types';
import { createQuickCashReceipt, type CashReceiptFormState } from '@/lib/actions/transaction';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface QuickCashReceiptFormProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onReceiptCreated: () => void;
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

export function QuickCashReceiptForm({ client, isOpen, setIsOpen, onReceiptCreated }: QuickCashReceiptFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  
  const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [state, formAction] = useActionState<CashReceiptFormState, FormData>(createQuickCashReceipt, undefined);

  React.useEffect(() => {
    if (!isOpen) return;
    const accountsRef = ref(db, 'accounts');
    const unsubscribe = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allAccountsData: Record<string, Account> = snapshot.val();
        const allAccountsList = Object.keys(allAccountsData).map(key => ({ id: key, ...allAccountsData[key] }));
        setBankAccounts(allAccountsList.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isOpen]);

  React.useEffect(() => {
    if (state?.success) {
      toast({ title: 'Success', description: state.message });
      onReceiptCreated();
      setIsOpen(false);
      formRef.current?.reset();
    } else if (state?.message) {
      toast({ title: 'Error', variant: 'destructive', description: state.message });
    }
  }, [state, toast, onReceiptCreated, setIsOpen]);

  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record New Cash Receipt</DialogTitle>
          <DialogDescription>
            Quickly add a cash receipt for {client.name}. This will become available to use in the transaction immediately.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} ref={formRef}>
          <input type="hidden" name="clientId" value={client.id} />
          <input type="hidden" name="clientName" value={client.name} />
          <div className="space-y-4 py-4">
             <div className="space-y-2">
                <Label htmlFor="bankAccountId">Received In (Bank Account)</Label>
                <Select name="bankAccountId" required>
                    <SelectTrigger><SelectValue placeholder="Select bank account..." /></SelectTrigger>
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
                <Label htmlFor="amount">Amount Received</Label>
                <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" />
                {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
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
      </DialogContent>
    </Dialog>
  );
}
