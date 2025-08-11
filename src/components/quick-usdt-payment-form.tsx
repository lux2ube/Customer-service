
'use client';

import * as React from 'react';
import { useFormStatus, useActionState } from 'react-dom';
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
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { Client } from '@/lib/types';
import { createUsdtManualPayment, createSendRequest, type UsdtPaymentState, type SendRequestState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Send, ClipboardPaste } from 'lucide-react';
import { ethers } from 'ethers';

interface QuickUsdtPaymentFormProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onPaymentCreated: () => void;
}

function ManualSubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Recording...' : 'Record Manual Payment'}
        </Button>
    );
}

function AutoSubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {pending ? 'Sending...' : 'Send from Wallet'}
        </Button>
    );
}

export function QuickUsdtPaymentForm({ client, isOpen, setIsOpen, onPaymentCreated }: QuickUsdtPaymentFormProps) {
  const { toast } = useToast();
  const manualFormRef = React.useRef<HTMLFormElement>(null);
  const autoFormRef = React.useRef<HTMLFormElement>(null);

  const [manualState, manualFormAction] = useActionState<UsdtPaymentState, FormData>(createUsdtManualPayment, undefined);
  const [autoState, autoFormAction] = useActionState<SendRequestState, FormData>(createSendRequest, undefined);
  
  const [selectedAddress, setSelectedAddress] = React.useState<string | undefined>(client?.bep20_addresses?.[0]);
  const [addressInput, setAddressInput] = React.useState('');

  React.useEffect(() => {
    if (client?.bep20_addresses?.[0]) {
      setAddressInput(client.bep20_addresses[0]);
    } else {
      setAddressInput('');
    }
  }, [client]);

  const stateRef = React.useRef<{ manual?: UsdtPaymentState, auto?: SendRequestState }>({});

  React.useEffect(() => {
    if (manualState && manualState !== stateRef.current.manual) {
      if (manualState.success) {
        toast({ title: 'Success', description: manualState.message });
        onPaymentCreated();
        setIsOpen(false);
        manualFormRef.current?.reset();
      } else if (manualState.message) {
        toast({ title: 'Error', variant: 'destructive', description: manualState.message });
      }
      stateRef.current.manual = manualState;
    }
  }, [manualState, toast, onPaymentCreated, setIsOpen]);
  
  React.useEffect(() => {
    if (autoState && autoState !== stateRef.current.auto) {
      if (autoState.success) {
        toast({ title: 'Success', description: autoState.message });
        onPaymentCreated();
        setIsOpen(false);
        autoFormRef.current?.reset();
      } else if (autoState.message) {
        toast({ title: 'Error', variant: 'destructive', description: autoState.message });
      }
      stateRef.current.auto = autoState;
    }
  }, [autoState, toast, onPaymentCreated, setIsOpen]);

  if (!client) return null;
  
  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    if (ethers.isAddress(text)) {
      setAddressInput(text);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record New USDT Payment</DialogTitle>
          <DialogDescription>
            For client: {client.name}
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="auto">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="auto">Auto Send</TabsTrigger>
            <TabsTrigger value="manual">Manual Record</TabsTrigger>
          </TabsList>
          
          <TabsContent value="auto">
            <Card className="border-none shadow-none">
              <CardHeader className="p-2 pt-4">
                  <CardTitle className="text-base">Send from System Wallet</CardTitle>
                  <CardDescription className="text-xs">This will execute a live transaction on the BSC network.</CardDescription>
              </CardHeader>
              <form action={autoFormAction} ref={autoFormRef}>
                <CardContent className="space-y-4">
                   <div className="space-y-2">
                        <Label>Recipient Address</Label>
                        <div className="flex items-center gap-2">
                            <Input name="recipientAddress" placeholder="Client's BEP20 address" value={addressInput} onChange={(e) => setAddressInput(e.target.value)} className="font-mono text-xs" />
                            <Button type="button" variant="outline" size="icon" onClick={handlePaste}><ClipboardPaste className="h-4 w-4" /></Button>
                        </div>
                        {autoState?.errors?.recipientAddress && <p className="text-destructive text-sm">{autoState.errors.recipientAddress[0]}</p>}
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
                        {autoState?.errors?.amount && <p className="text-destructive text-sm">{autoState.errors.amount[0]}</p>}
                    </div>
                </CardContent>
                <DialogFooter className="pt-4">
                    <AutoSubmitButton />
                </DialogFooter>
              </form>
            </Card>
          </TabsContent>
          
          <TabsContent value="manual">
             <Card className="border-none shadow-none">
              <CardHeader className="p-2 pt-4">
                  <CardTitle className="text-base">Record a Past Payment</CardTitle>
                  <CardDescription className="text-xs">Log a USDT payment that was sent outside of this system.</CardDescription>
              </CardHeader>
              <form action={manualFormAction} ref={manualFormRef}>
                <input type="hidden" name="clientId" value={client.id} />
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                      <Label htmlFor="manual_recipientAddress">Recipient Address</Label>
                      <Input id="manual_recipientAddress" name="recipientAddress" placeholder="Client's BEP20 address" required />
                      {manualState?.errors?.recipientAddress && <p className="text-destructive text-sm">{manualState.errors.recipientAddress[0]}</p>}
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="manual_amount">Amount (USDT)</Label>
                      <Input id="manual_amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required />
                      {manualState?.errors?.amount && <p className="text-destructive text-sm">{manualState.errors.amount[0]}</p>}
                  </div>
                   <div className="space-y-2">
                      <Label htmlFor="txid">Transaction Hash (TxID)</Label>
                      <Input id="txid" name="txid" placeholder="Optional" />
                  </div>
                </CardContent>
                <DialogFooter className="pt-4">
                  <ManualSubmitButton />
                </DialogFooter>
              </form>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
