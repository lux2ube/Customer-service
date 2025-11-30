

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
   ChevronsUpDown
} from 'lucide-react';

import { db } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { createUsdtManualPayment, type UsdtPaymentState } from '@/lib/actions/financial-records';
import { searchClients } from '@/lib/actions/client';

import { useFormHotkeys } from '@/hooks/use-form-hotkeys';
import type { Client, Account, UsdtRecord, ServiceProvider } from '@/lib/types';
import { onValue, ref } from 'firebase/database';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter
} from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from './ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from './ui/command';


// ----------------- Submit Button -----------------
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
  // ----------------- Client Selector -----------------
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
   // Keep input value synced with selected client
  React.useEffect(() => {
    setInputValue(selectedClient?.name || '');
  }, [selectedClient]);
   // Search clients with debounce
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
  // ----------------- Main Form -----------------
export function UsdtManualPaymentForm({
   record,
   clients,
   clientFromProps, // Client passed in from another component
   onFormSubmit, // Callback for when form is submitted
 }: {
   record?: UsdtRecord;
   clients?: Client[]; // Make clients optional for embedded use case
   clientFromProps?: Client;
   onFormSubmit?: () => void;
 }) {
  const { toast } = useToast();
  const router = useRouter();
  const formRef = React.useRef<HTMLFormElement>(null);
   const actionWithId = createUsdtManualPayment.bind(null, record?.id || null);
  const [state, formAction] = useActionState<UsdtPaymentState, FormData>(actionWithId, undefined);
    useFormHotkeys(formRef);
   // ----------------- Local State -----------------
  const [date, setDate] = React.useState<Date | undefined>(
    record?.date ? parseISO(record.date) : undefined
  );
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(
    () => clientFromProps || (clients?.find(c => c.id === record?.clientId)) || null
  );
  const [accountId, setAccountId] = React.useState(record?.accountId || '');
  const [recipientAddress, setRecipientAddress] = React.useState(record?.clientWalletAddress || '');
  const [amount, setAmount] = React.useState(record?.amount?.toString() || '');
  const [txHash, setTxHash] = React.useState(record?.txHash || '');
  const [status, setStatus] = React.useState(record?.status || 'Confirmed');
  const [notes, setNotes] = React.useState(record?.notes || '');
   // Wallets state
  const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>([]);
  const [loadingWallets, setLoadingWallets] = React.useState(true);
  const [serviceProviders, setServiceProviders] = React.useState<ServiceProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = React.useState(true);
   // Get service provider for selected account
  const selectedAccountProvider = React.useMemo(() => {
    if (!accountId) return null;
    return serviceProviders.find(sp => sp.accountIds.includes(accountId)) || null;
  }, [accountId, serviceProviders]);

  // Check if BEP20 address field should be shown
  const shouldShowBep20Address = React.useMemo(() => {
    if (!selectedAccountProvider) return true; // Default to showing if no provider
    return selectedAccountProvider.cryptoFormula?.includes('Address') ?? true;
  }, [selectedAccountProvider]);

   // ----------------- Effects -----------------
  // Load wallets from Firebase
  React.useEffect(() => {
    setLoadingWallets(true);
    const accountsRef = ref(db, 'accounts');
     const unsubscribe = onValue(accountsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allAccountsData: Record<string, Account> = snapshot.val();
        const allAccounts: Account[] = Object.entries(allAccountsData).map(([id, data]) => ({
            id,
            ...(data as Account),
        }));
        setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
      }
      setLoadingWallets(false);
    });
     return () => unsubscribe();
  }, []);

  // Load service providers from Firebase
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
   // Initialize new record with today's date
  React.useEffect(() => {
    if (!record) setDate(new Date());
  }, [record]);
   // Handle form result
  React.useEffect(() => {
    if (state?.success) {
      toast({ title: 'Success', description: state.message });
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
        setRecipientAddress('');
        setAmount('');
        setTxHash('');
        setStatus('Confirmed');
        setNotes('');
      }
    } else if (state?.message) {
      toast({ title: 'Error', description: state.message, variant: 'destructive' });
    }
  }, [state, toast, record, router, clientFromProps, onFormSubmit]);
   const isEditing = !!record;
   const isEmbedded = !!clientFromProps;
   // ----------------- Render -----------------
  return (
    <form action={formAction} ref={formRef}>
      <input type="hidden" name="source" value={record?.source || 'Manual'} />
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
          {/* Date + Client */}
          {!isEmbedded && (
            <div className="grid md:grid-cols-2 gap-4">
                {/* Date */}
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
                {/* Client */}
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

           {/* Wallet */}
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
            {state?.errors?.accountId && (
              <p className="text-sm text-destructive">
                {state.errors.accountId[0]}
              </p>
            )}
          </div>
           {/* Recipient Address - only show if service provider requires it */}
          {shouldShowBep20Address && (
            <div className="space-y-2">
              <Label htmlFor="recipientAddress">Recipient BEP20 Address</Label>
              <Input
                 id="recipientAddress"
                 name="recipientAddress"
                 placeholder="0x..."
                 required
                 value={recipientAddress}
                 onChange={(e) => setRecipientAddress(e.target.value)}
               />
              {state?.errors?.recipientAddress && (
                <p className="text-sm text-destructive">
                  {state.errors.recipientAddress[0]}
                </p>
              )}
            </div>
          )}
           {/* Amount + TxHash */}
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
               />
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
           {/* Status + Notes */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                 name="status"
                 value={status}
                 onValueChange={(v) => setStatus(v as any)}
              >
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Used">Used</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
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
