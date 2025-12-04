'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { onValue, ref } from 'firebase/database';
import { format, parseISO } from 'date-fns';
import {
   Calendar as CalendarIcon,
   Save,
   Loader2,
   Check,
   ChevronsUpDown,
   CheckCircle2
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useProviderAutoFill } from '@/hooks/use-provider-auto-fill';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions/financial-records';
import { searchClients } from '@/lib/actions/client';

import { useFormHotkeys } from '@/hooks/use-form-hotkeys';
import type { Client, Account, UsdtRecord, ServiceProvider } from '@/lib/types';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter
} from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import { Badge } from './ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from './ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from './ui/command';


function SubmitButton({ isEditing }: { isEditing: boolean }) {
  const { pending } = useFormStatus();
   return (
     <Button type="submit" disabled={pending}>
       {pending
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <Save className="mr-2 h-4 w-4" />
       }
       {pending
          ? 'Recording...'
          : isEditing ? 'Save Changes' : 'Record Payment'
       }
     </Button>
   );
}

function ClientSelector({
  selectedClient,
  onSelect,
}: {
  selectedClient: Client | null;
  onSelect: (client: Client | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(selectedClient?.name || '');
  const [searchResults, setSearchResults] = React.useState<Client[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
   const debounceRef = React.useRef<NodeJS.Timeout | null>(null);
  
   React.useEffect(() => {
    setInputValue(selectedClient?.name || '');
  }, [selectedClient]);
  
   React.useEffect(() => {
    if (inputValue.length < 2) {
      setSearchResults([]);
      return;
    }
     setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
     debounceRef.current = setTimeout(async () => {
      const results = await searchClients(inputValue);
      setSearchResults(results);
      setIsLoading(false);
    }, 300);
     return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue]);
  
   const getPhone = (phone: string | string[] | undefined) =>
     Array.isArray(phone) ? phone.join(', ') : phone || '';
  
   const handleSelect = (client: Client) => {
    onSelect(client);
    setOpen(false);
  };
  
   return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search client by name or phone..."
              value={inputValue}
              onValueChange={setInputValue}
            />
          </Command>
        </div>
      </PopoverTrigger>
       <PopoverContent
         className="w-[--radix-popover-trigger-width] p-0"
         align="start"
      >
        <Command>
          <CommandList>
            {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
            {!isLoading && searchResults.length === 0 && inputValue.length > 1 && (
              <CommandEmpty>No client found.</CommandEmpty>
            )}
             <CommandGroup>
              {searchResults.map(client => (
                <CommandItem
                   key={client.id}
                   value={client.name}
                   onSelect={() => handleSelect(client)}
                >
                  <Check
                     className={cn(
                      "mr-2 h-4 w-4",
                       selectedClient?.id === client.id ? "opacity-100" : "opacity-0"
                    )}
                   />
                  <div className="flex flex-col">
                    <span>{client.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {getPhone(client.phone)}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function UsdtManualPaymentForm({
   record,
   clients,
   clientFromProps,
   onFormSubmit,
 }: {
   record?: UsdtRecord;
   clients?: Client[];
   clientFromProps?: Client;
   onFormSubmit?: () => void;
 }) {
  const { toast } = useToast();
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
   const actionWithId = createUsdtManualPayment.bind(null, record?.id || null);
  const [state, formAction] = useActionState<UsdtPaymentState, FormData>(actionWithId, undefined);
    useFormHotkeys(formRef);
  
   const [date, setDate] = React.useState<Date | undefined>(
    record?.date ? parseISO(record.date) : undefined
  );
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(
    () => clientFromProps || (clients?.find(c => c.id === record?.clientId)) || null
  );
  const [accountId, setAccountId] = React.useState(record?.accountId || '');
  const [amount, setAmount] = React.useState(record?.amount?.toString() || '');
  const [txHash, setTxHash] = React.useState(record?.txHash || '');
  const [status, setStatus] = React.useState<string>(record?.status || 'Confirmed');
  const [notes, setNotes] = React.useState(record?.notes || '');
  
   const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
  const [loadingWallets, setLoadingWallets] = React.useState(true);
  const [serviceProviders, setServiceProviders] = React.useState<ServiceProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = React.useState(true);
  
  const { state: autoFillState, updateField, getRecipientDetails, isReady, refreshClient } = useProviderAutoFill(
    selectedClient,
    accountId,
    serviceProviders
  );

   React.useEffect(() => {
    setLoadingWallets(true);
    const accountsRef = ref(db, 'accounts');
     const unsubscribe = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allAccountsData: Record<string, Account> = snapshot.val();
        const allAccounts: Account[] = Object.entries(allAccountsData).map(([accountKey, data]) => ({
            ...(data as Account),
            id: accountKey,
        }));
        setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
      }
      setLoadingWallets(false);
    });
     return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    setLoadingProviders(true);
    const providersRef = ref(db, 'serviceProviders');
    const unsubscribe = onValue(providersRef, (snapshot) => {
      if (snapshot.exists()) {
        const providersData: Record<string, ServiceProvider> = snapshot.val();
        setServiceProviders(Object.values(providersData));
      }
      setLoadingProviders(false);
    });
    return () => unsubscribe();
  }, []);
  
   React.useEffect(() => {
    if (!record) setDate(new Date());
  }, [record]);
  
   React.useEffect(() => {
    if (state?.success) {
      toast({ title: 'Success', description: state.message });
      
      if (state.updatedClientServiceProviders && selectedClient) {
        refreshClient({
          ...selectedClient,
          serviceProviders: state.updatedClientServiceProviders,
        });
      }
      
      if (onFormSubmit) {
        onFormSubmit();
      }
       if (record?.id) {
        router.push('/modern-usdt-records');
      } else {
        formRef.current?.reset();
        setDate(new Date());
        if (!clientFromProps) setSelectedClient(null);
        setAccountId('');
        setAmount('');
        setTxHash('');
        setStatus('Confirmed');
        setNotes('');
      }
    } else if (state?.message) {
      toast({ title: 'Error', description: state.message, variant: 'destructive' });
    }
  }, [state, toast, record, router, clientFromProps, onFormSubmit, selectedClient, refreshClient]);
  
   const isEditing = !!record;
   const isEmbedded = !!clientFromProps;
   const isConfirmed = record?.status === 'Confirmed';
   const isAmountLocked = isEditing && isConfirmed;
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const formElement = e.currentTarget;
    const detailsInput = formElement.querySelector('input[name="recipientDetails"]') as HTMLInputElement;
    if (detailsInput) {
      detailsInput.value = getRecipientDetails();
    }
  };

   return (
    <form action={formAction} ref={formRef} onSubmit={handleSubmit}>
      <input type="hidden" name="source" value={record?.source || 'Manual'} />
      <input type="hidden" name="recipientDetails" value={getRecipientDetails()} />
      
       <Card className={isEmbedded ? "border-none shadow-none" : ""}>
        {!isEmbedded && (
            <CardHeader>
            <CardTitle>
                {isEditing ? 'Edit' : 'New'} USDT Manual Payment
            </CardTitle>
            <CardDescription>
                {isEditing
                ? `Editing record ID: ${record.id}`
                : 'Record sending USDT to a client manually. This creates an outflow record.'}
            </CardDescription>
            </CardHeader>
        )}
         <CardContent className="space-y-4 pt-6">
          {!isEmbedded && (
            <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className={cn(
                        "w-full justify-start text-left font-normal",
                        !date && "text-muted-foreground"
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                </div>
                <div className="space-y-2">
                <Label htmlFor="clientId">Paid To (Client)</Label>
                <ClientSelector
                    selectedClient={selectedClient}
                    onSelect={setSelectedClient}
                />
                </div>
            </div>
          )}
          
          <input type="hidden" name="date" value={date?.toISOString() || ''} />
          <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
          <input type="hidden" name="clientName" value={selectedClient?.name || ''} />

          <div className="space-y-2">
            <Label htmlFor="accountId">Paid From (System Wallet)</Label>
            <Select
               name="accountId"
               required
               value={accountId}
               onValueChange={setAccountId}
               disabled={loadingWallets}
            >
              <SelectTrigger>
                <SelectValue
                   placeholder={loadingWallets
                     ? "Loading wallets..."
                     : "Select system wallet..."}
                 />
              </SelectTrigger>
              <SelectContent>
                {loadingWallets ? (
                  <SelectItem value="loading" disabled>
                    Loading...
                  </SelectItem>
                ) : (
                  cryptoWallets.map(wallet => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.name}
                    </SelectItem>
                  ))
                )}
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
            {state?.errors?.accountId && (
              <p className="text-sm text-destructive">
                {state.errors.accountId[0]}
              </p>
            )}
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
                required
                value={autoFillState.fieldValues[field] || ''}
                onChange={(e) => updateField(field, e.target.value)}
              />
            </div>
          ))}
          {accountId && autoFillState.formulaFields.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No payment formula is set for this provider. Add one in Service Provider settings.
            </p>
          )}
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USDT)</Label>
              <Input
                 id="amount"
                 name="amount"
                 type="number"
                 step="any"
                 required
                 placeholder="e.g., 500.00"
                 value={amount}
                 onChange={(e) => setAmount(e.target.value)}
                 disabled={isAmountLocked}
                 className={isAmountLocked ? 'bg-muted cursor-not-allowed' : ''}
               />
              {isAmountLocked && (
                <p className="text-xs text-muted-foreground">Amount is locked on confirmed records</p>
              )}
              {state?.errors?.amount && (
                <p className="text-sm text-destructive">
                  {state.errors.amount[0]}
                </p>
              )}
            </div>
             <div className="space-y-2">
              <Label htmlFor="txid">Transaction Hash (TxID)</Label>
              <Input
                 id="txid"
                 name="txid"
                 placeholder="Optional"
                 value={txHash}
                 onChange={(e) => setTxHash(e.target.value)}
               />
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                 name="status"
                 value={status}
                 onValueChange={setStatus}
              >
                <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Confirmed">Confirmed (Auto-journaled)</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                  <SelectItem value="Used">Used</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                 id="notes"
                 name="notes"
                 placeholder="Optional notes about the transaction"
                 value={notes}
                 onChange={(e) => setNotes(e.target.value)}
               />
            </div>
          </div>
        </CardContent>
         <CardFooter className="flex justify-end">
          <SubmitButton isEditing={isEditing} />
        </CardFooter>
      </Card>
    </form>
  );
}
