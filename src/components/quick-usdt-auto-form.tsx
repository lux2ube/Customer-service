
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { DialogFooter, DialogClose } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import type { Client, Account } from '@/lib/types';
import { createSendRequest, type SendRequestState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, ClipboardPaste } from 'lucide-react';
import { ethers } from 'ethers';

interface QuickUsdtAutoFormProps {
  client: Client;
  onPaymentSent: () => void;
  setIsOpen: (open: boolean) => void;
  usdtAccounts: Account[];
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {pending ? 'Sending...' : 'Send from Wallet'}
        </Button>
    );
}

export function QuickUsdtAutoForm({ client, onPaymentSent, setIsOpen, usdtAccounts }: QuickUsdtAutoFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState<SendRequestState, FormData>(createSendRequest, undefined);
  
  const [selectedAddress, setSelectedAddress] = React.useState<string | undefined>(client?.bep20_addresses?.[0]);
  const [addressInput, setAddressInput] = React.useState(client?.bep20_addresses?.[0] || '');
  
  const stateRef = React.useRef<SendRequestState>();

  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        onPaymentSent();
        setIsOpen(false);
        formRef.current?.reset();
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
      stateRef.current = state;
    }
  }, [state, toast, onPaymentSent, setIsOpen]);

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
        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Recipient Address</Label>
                <div className="flex items-center gap-2">
                    <Input name="recipientAddress" placeholder="Client's BEP20 address" value={addressInput} onChange={(e) => setAddressInput(e.target.value)} className="font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon" onClick={handlePaste}><ClipboardPaste className="h-4 w-4" /></Button>
                </div>
                {state?.errors?.recipientAddress && <p className="text-destructive text-sm">{state.errors.recipientAddress[0]}</p>}
            </div>

            {client.bep20_addresses && client.bep20_addresses.length > 0 && (
                <RadioGroup onValueChange={setAddressInput} value={addressInput} className="space-y-2">
                    {client.bep20_addresses.map(address => (
                        <div key={address} className="flex items-center space-x-2 p-2 border rounded-md has-[[data-state=checked]]:bg-muted">
                            <RadioGroupItem value={address} id={`auto-${address}`} />
                            <Label htmlFor={`auto-${address}`} className="font-mono text-xs break-all">{address}</Label>
                        </div>
                    ))}
                </RadioGroup>
            )}

            <div className="space-y-2">
                <Label htmlFor="auto_amount">Amount (USDT)</Label>
                <Input id="auto_amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required />
                {state?.errors?.amount && <p className="text-destructive text-sm">{state.errors.amount[0]}</p>}
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
