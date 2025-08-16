

'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { DialogFooter, DialogClose } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { Client } from '@/lib/types';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions/financial-records';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, ClipboardPaste } from 'lucide-react';
import { ethers } from 'ethers';

interface QuickUsdtManualFormProps {
  client: Client;
  onPaymentCreated: (newRecordId: string) => void;
  setIsOpen: (open: boolean) => void;
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Recording...' : 'Record Manual Payment'}
        </Button>
    );
}

export function QuickUsdtManualForm({ client, onPaymentCreated, setIsOpen }: QuickUsdtManualFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState(createUsdtManualPayment.bind(null, null), undefined);
  
  const [addressInput, setAddressInput] = React.useState(client?.bep20_addresses?.[0] || '');
  
  const stateRef = React.useRef<any>();

  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        onPaymentCreated(state.newRecordId || '');
        setIsOpen(false);
        formRef.current?.reset();
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
      stateRef.current = state;
    }
  }, [state, toast, onPaymentCreated, setIsOpen]);
  
  const handlePaste = async () => {
    try {
        const text = await navigator.clipboard.readText();
        if (ethers.isAddress(text)) {
          setAddressInput(text);
        } else {
            toast({ variant: 'destructive', title: 'Invalid Address', description: 'The pasted text is not a valid BSC address.'});
        }
    } catch (err) {
        toast({ variant: 'destructive', title: 'Paste Failed', description: 'Could not read from clipboard.'});
    }
  };

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4">
      <input type="hidden" name="clientId" value={client.id} />
      <input type="hidden" name="clientName" value={client.name} />
      <input type="hidden" name="date" value={new Date().toISOString()} />
      <input type="hidden" name="status" value="Confirmed" />
      <div className="space-y-4 py-4">
        <div className="space-y-2">
            <Label htmlFor="manual_recipientAddress">Recipient Address</Label>
            <div className="flex items-center gap-2">
                <Input id="manual_recipientAddress" name="recipientAddress" placeholder="Client's BEP20 address" required value={addressInput} onChange={(e) => setAddressInput(e.target.value)} />
                <Button type="button" variant="outline" size="icon" onClick={handlePaste}><ClipboardPaste className="h-4 w-4" /></Button>
            </div>
            {state?.errors?.recipientAddress && <p className="text-destructive text-sm">{state.errors.recipientAddress[0]}</p>}
        </div>
        <div className="space-y-2">
            <Label htmlFor="manual_amount">Amount (USDT)</Label>
            <Input id="manual_amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required />
            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
        </div>
        <div className="space-y-2">
            <Label htmlFor="txid">Transaction Hash (TxID)</Label>
            <Input id="txid" name="txid" placeholder="Optional" />
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
