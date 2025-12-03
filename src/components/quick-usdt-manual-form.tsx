'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { Client, Account, ServiceProvider } from '@/lib/types';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions/financial-records';
import { getUnifiedClientRecords } from '@/lib/actions/transaction';
import { useToast } from '@/hooks/use-toast';
import { useProviderAutoFill } from '@/hooks/use-provider-auto-fill';
import { Save, Loader2, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useFormHotkeys } from '@/hooks/use-form-hotkeys';
import { Badge } from './ui/badge';

interface QuickUsdtManualFormProps {
  client: Client;
  onPaymentCreated: (newRecordId?: string) => void;
  setIsOpen: (open: boolean) => void;
  onClose?: () => void;
  usdtAccounts: Account[];
  serviceProviders: ServiceProvider[];
}

function SubmitButton({ disabled }: { disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Recording...' : 'Record Manual Payment'}
        </Button>
    );
}

export function QuickUsdtManualForm({ client, onPaymentCreated, setIsOpen, onClose, usdtAccounts, serviceProviders }: QuickUsdtManualFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  useFormHotkeys(formRef);

  const [state, formAction] = useActionState(createUsdtManualPayment.bind(null, null), undefined);
  
  const [selectedAccountId, setSelectedAccountId] = React.useState('');
  const [isInitialized, setIsInitialized] = React.useState(false);
  
  const stateRef = React.useRef<UsdtPaymentState>();
  
  const { state: autoFillState, updateField, getRecipientDetails, isReady, refreshClient } = useProviderAutoFill(
    client,
    selectedAccountId,
    serviceProviders
  );

  React.useEffect(() => {
    const loadSmartDefaults = async () => {
      if (isInitialized) return;
      
      try {
        const records = await getUnifiedClientRecords(client.id);
        const latestUsdtRecord = records
          .filter(r => r.type === 'outflow')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .find(r => usdtAccounts.some(acc => acc.id === (r as any).accountId));
        
        if (latestUsdtRecord && (latestUsdtRecord as any).accountId) {
          setSelectedAccountId((latestUsdtRecord as any).accountId);
        } else {
          const defaultAccount = usdtAccounts.find(acc => acc.id === '1001');
          setSelectedAccountId(defaultAccount?.id || usdtAccounts[0]?.id || '');
        }
        setIsInitialized(true);
      } catch (e) {
        console.warn("Could not load recent records:", e);
        const defaultAccount = usdtAccounts.find(acc => acc.id === '1001');
        setSelectedAccountId(defaultAccount?.id || usdtAccounts[0]?.id || '');
        setIsInitialized(true);
      }
    };

    if (usdtAccounts.length > 0 && !isInitialized) {
      loadSmartDefaults();
    }
  }, [usdtAccounts.length, isInitialized, client.id]);

  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      stateRef.current = state;
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        
        if (state.updatedClientServiceProviders) {
          refreshClient({
            ...client,
            serviceProviders: state.updatedClientServiceProviders,
          });
        }
        
        onPaymentCreated(state.newRecordId);
        if (onClose) {
            onClose();
        } else {
            setIsOpen(false);
        }
        formRef.current?.reset();
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
    }
  }, [state, toast, onPaymentCreated, setIsOpen, onClose, client, refreshClient]);

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formElement = e.currentTarget;
    const detailsInput = formElement.querySelector('input[name="recipientDetails"]') as HTMLInputElement;
    if (detailsInput) {
      detailsInput.value = getRecipientDetails();
    }
  };

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4" onSubmit={handleSubmit}>
      <input type="hidden" name="clientId" value={client.id} />
      <input type="hidden" name="clientName" value={client.name} />
      <input type="hidden" name="date" value={new Date().toISOString()} />
      <input type="hidden" name="status" value="Confirmed" />
      <input type="hidden" name="recipientDetails" value={getRecipientDetails()} />
      
      <div className="space-y-4 py-4">
        <div className="space-y-2">
            <Label htmlFor="accountId">Paid From (System Wallet)</Label>
            <Select name="accountId" required value={selectedAccountId} onValueChange={handleAccountChange}>
                <SelectTrigger><SelectValue placeholder="Select system wallet..." /></SelectTrigger>
                <SelectContent>
                    {usdtAccounts.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                            {account.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {autoFillState.providerName && (
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                        {autoFillState.providerName}
                    </Badge>
                    {autoFillState.hasSavedDetails && (
                        <Badge variant="secondary" className="text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Auto-filled
                        </Badge>
                    )}
                </div>
            )}
            {state?.errors?.accountId && <p className="text-destructive text-sm">{state.errors.accountId[0]}</p>}
        </div>
        
        {autoFillState.formulaFields.map(field => (
            <div key={field} className="space-y-2">
                <Label htmlFor={`detail_${field}`}>
                    {field}
                    {autoFillState.hasSavedDetails && autoFillState.fieldValues[field] && (
                        <span className="text-xs text-muted-foreground ml-2">(saved)</span>
                    )}
                </Label>
                <Input 
                    id={`detail_${field}`} 
                    name={`detail_${field}`} 
                    placeholder={`Enter recipient's ${field}`} 
                    value={autoFillState.fieldValues[field] || ''}
                    onChange={(e) => updateField(field, e.target.value)}
                    required 
                />
            </div>
        ))}
        {selectedAccountId && autoFillState.formulaFields.length === 0 && (
             <p className="text-xs text-muted-foreground">No payment formula is set for this provider. Add one in Service Provider settings.</p>
        )}

        <div className="space-y-2">
            <Label htmlFor="manual_amount">Amount (USDT)</Label>
            <Input id="manual_amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required autoFocus/>
            {state?.errors?.amount && <p className="text-destructive text-sm">{state.errors.amount[0]}</p>}
        </div>
        <div className="space-y-2">
            <Label htmlFor="txid">Transaction Hash (TxID)</Label>
            <Input id="txid" name="txid" placeholder="Optional" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose || (() => setIsOpen(false))}>Cancel</Button>
        <SubmitButton disabled={!isReady} />
      </div>
    </form>
  );
}
