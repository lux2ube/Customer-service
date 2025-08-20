
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import { DialogFooter, DialogClose } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { Client, Account, ServiceProvider } from '@/lib/types';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions/financial-records';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useFormHotkeys } from '@/hooks/use-form-hotkeys';

interface QuickUsdtManualFormProps {
  client: Client;
  onPaymentCreated: (newRecordId?: string) => void;
  setIsOpen: (open: boolean) => void;
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

export function QuickUsdtManualForm({ client, onPaymentCreated, setIsOpen, usdtAccounts, serviceProviders }: QuickUsdtManualFormProps) {
  const { toast } = useToast();
  const formRef = React.useRef<HTMLFormElement>(null);
  useFormHotkeys(formRef);

  const [state, formAction] = useActionState(createUsdtManualPayment.bind(null, null), undefined);
  
  const [selectedAccountId, setSelectedAccountId] = React.useState('');
  const [dynamicFields, setDynamicFields] = React.useState<Record<string, string>>({});
  
  const stateRef = React.useRef<UsdtPaymentState>();
  
  const selectedProvider = React.useMemo(() => {
    if (!selectedAccountId) return null;
    return serviceProviders.find(p => p.accountIds.includes(selectedAccountId));
  }, [selectedAccountId, serviceProviders]);
  
  const formulaFields = selectedProvider?.cryptoFormula || [];

  React.useEffect(() => {
    // Set a default account when the component mounts or accounts change.
    if (usdtAccounts.length > 0 && !selectedAccountId) {
      const defaultAccount = usdtAccounts.find(acc => acc.id === '1001');
      if (defaultAccount) {
        setSelectedAccountId(defaultAccount.id);
      } else {
        // Fallback to the first account if 1001 isn't present
        setSelectedAccountId(usdtAccounts[0].id);
      }
    }
  }, [usdtAccounts, selectedAccountId]);

  React.useEffect(() => {
    if (state && state !== stateRef.current) {
      if (state.success) {
        toast({ title: 'Success', description: state.message });
        onPaymentCreated(state.newRecordId);
        setIsOpen(false);
        formRef.current?.reset();
        setSelectedAccountId(usdtAccounts.length > 0 ? usdtAccounts[0].id : '');
        setDynamicFields({});
      } else if (state.message) {
        toast({ title: 'Error', variant: 'destructive', description: state.message });
      }
      stateRef.current = state;
    }
  }, [state, toast, onPaymentCreated, setIsOpen, usdtAccounts]);

  const handleDynamicFieldChange = (key: string, value: string) => {
    setDynamicFields(prev => ({ ...prev, [key]: value }));
  };
  
  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    // Reset dynamic fields when account changes
    setDynamicFields({});
  }

  return (
    <form action={formAction} ref={formRef} className="pt-4 space-y-4">
      <input type="hidden" name="clientId" value={client.id} />
      <input type="hidden" name="clientName" value={client.name} />
      <input type="hidden" name="date" value={new Date().toISOString()} />
      <input type="hidden" name="status" value="Confirmed" />
      <input type="hidden" name="recipientDetails" value={JSON.stringify(dynamicFields)} />
      
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
            {state?.errors?.accountId && <p className="text-destructive text-sm">{state.errors.accountId[0]}</p>}
        </div>
        
        {formulaFields.map(field => (
            <div key={field} className="space-y-2">
                <Label htmlFor={`detail_${field}`}>{field}</Label>
                <Input 
                    id={`detail_${field}`} 
                    name={`detail_${field}`} 
                    placeholder={`Enter recipient's ${field}`} 
                    value={dynamicFields[field] || ''}
                    onChange={(e) => handleDynamicFieldChange(field, e.target.value)}
                    required 
                />
            </div>
        ))}
        {selectedAccountId && formulaFields.length === 0 && (
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
      <DialogFooter>
        <DialogClose asChild>
            <Button type="button" variant="secondary">Cancel</Button>
        </DialogClose>
        <SubmitButton disabled={!selectedProvider || formulaFields.length === 0} />
      </DialogFooter>
    </form>
  );
}
