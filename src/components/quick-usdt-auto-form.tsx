
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { DialogFooter, DialogClose } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import type { Client, Account, ServiceProvider } from '@/lib/types';
import { createSendRequest, type SendRequestState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Send, Loader2, ClipboardPaste, PlusCircle } from 'lucide-react';
import { ethers } from 'ethers';
import { get } from 'firebase/database';
import { db } from '@/lib/firebase';
import { ref } from 'firebase/database';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';


interface QuickUsdtAutoFormProps {
  client: Client;
  onPaymentSent: () => void;
  setIsOpen: (open: boolean) => void;
  usdtAccounts: Account[];
  serviceProviders: ServiceProvider[];
  defaultRecordingAccountId: string;
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {pending ? 'Sending...' : 'Send Now'}
        </Button>
    );
}

export function QuickUsdtAutoForm({ client, onPaymentSent, setIsOpen, usdtAccounts, serviceProviders, defaultRecordingAccountId }: QuickUsdtAutoFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [state, formAction] = useActionState<SendRequestState, FormData>(createSendRequest, undefined);
  
  const [addressInput, setAddressInput] = React.useState('');
  const [isAddingNew, setIsAddingNew] = React.useState(false);

  const activeProvider = React.useMemo(() => {
    if (!defaultRecordingAccountId) return null;
    return serviceProviders.find(p => p.accountIds.includes(defaultRecordingAccountId));
  }, [serviceProviders, defaultRecordingAccountId]);

  const clientCryptoAddresses = React.useMemo(() => {
        if (!client || !client.serviceProviders || !activeProvider) return [];
        return client.serviceProviders.filter(sp => sp.providerId === activeProvider.id && sp.details.Address);
  }, [client, activeProvider]);
  
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
          setIsAddingNew(true); // Switch to new address mode on paste
        } else {
            toast({ variant: 'destructive', title: 'Invalid Address', description: 'The pasted text is not a valid BSC address.'});
        }
    } catch (err) {
        toast({ variant: 'destructive', title: 'Paste Failed', description: 'Could not read from clipboard.'});
    }
  };
  
  const handleAddNewClick = () => {
    setIsAddingNew(true);
    setAddressInput('');
  }
  
  const handleSelectSaved = (address: string) => {
    setIsAddingNew(false);
    setAddressInput(address);
  };

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4">
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="creditAccountId" value={defaultRecordingAccountId} />
        <input type="hidden" name="isNewAddress" value={isAddingNew ? 'true' : 'false'} />
        {activeProvider && <input type="hidden" name="serviceProviderId" value={activeProvider.id} />}


        <div className="space-y-4 py-4">
            <div className="space-y-2">
                <Label>Recipient Address</Label>
                <div className="flex items-center gap-2">
                    <Input 
                        name="recipientAddress" 
                        placeholder={isAddingNew ? "Paste new address here" : "Select a saved address"} 
                        value={addressInput} 
                        onChange={(e) => isAddingNew && setAddressInput(e.target.value)} 
                        readOnly={!isAddingNew}
                        className="font-mono text-xs" 
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={handlePaste}><ClipboardPaste className="h-4 w-4" /></Button>
                </div>
                 {state?.errors?.recipientAddress && <p className="text-destructive text-sm">{state.errors.recipientAddress[0]}</p>}
            </div>

            {clientCryptoAddresses.length > 0 && (
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Select a saved address</Label>
                     <RadioGroup onValueChange={handleSelectSaved} value={isAddingNew ? '' : addressInput} className="space-y-2 max-h-32 overflow-y-auto pr-2">
                        {clientCryptoAddresses.map(address => (
                            <div key={address.details.Address} className="flex items-center space-x-2 p-2 border rounded-md has-[[data-state=checked]]:bg-muted has-[[data-state=checked]]:border-primary">
                                <RadioGroupItem value={address.details.Address} id={`auto-${address.details.Address}`} />
                                <Label htmlFor={`auto-${address.details.Address}`} className="font-mono text-xs break-all cursor-pointer">{address.details.Address}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                </div>
            )}
            
            <Button type="button" variant="outline" size="sm" onClick={handleAddNewClick}>
                <PlusCircle className="mr-2 h-4 w-4"/> Add New Address
            </Button>


            <div className="space-y-2">
                <Label htmlFor="auto_amount">Amount (USDT)</Label>
                <Input id="auto_amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required />
                 {state?.errors?.amount && <p className="text-destructive text-sm">{state.errors.amount[0]}</p>}
            </div>
             {!activeProvider && (
                <Alert variant="destructive">
                    <AlertTitle>Configuration Error</AlertTitle>
                    <AlertDescription>The selected default recording account is not linked to any Service Provider. Please configure this in the Service Providers page.</AlertDescription>
                </Alert>
            )}
        </div>
        <DialogFooter>
             <DialogClose asChild>
                <Button type="button" variant="secondary">Cancel</Button>
            </DialogClose>
            <SubmitButton disabled={!defaultRecordingAccountId || !activeProvider} />
        </DialogFooter>
    </form>
  );
}
