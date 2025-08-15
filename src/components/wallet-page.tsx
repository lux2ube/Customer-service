
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Wallet, Send, Copy, RefreshCw, Loader2, ExternalLink, Check, ChevronsUpDown, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getWalletDetails, createSendRequest, searchClients, findClientByAddress, type WalletDetailsState, type SendRequestState } from '@/lib/actions';
import type { SendRequest, Client, Account } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, query, limitToLast, orderByChild } from 'firebase/database';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from './ui/table';
import { format, formatDistanceToNow } from 'date-fns';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { ethers } from 'ethers';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function SendButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                </>
            ) : (
                <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Now
                </>
            )}
        </Button>
    );
}

function WalletInfoCard({ details, onRefresh }: { details: WalletDetailsState, onRefresh: () => void }) {
    const { toast } = useToast();

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: "Copied to clipboard!" });
    };
    
    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Sender Wallet Info</CardTitle>
                    <Button variant="ghost" size="icon" onClick={onRefresh} disabled={details.loading}>
                        {details.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                </div>
                <CardDescription>
                    This is the wallet used to send USDT. Its private key is stored securely in your environment variables.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 {details.error && <p className="text-destructive text-sm">{details.error}</p>}
                <div className="space-y-2">
                    <Label>Wallet Address</Label>
                    <div className="flex items-center gap-2">
                        {details.loading ? <Skeleton className="h-9 w-full" /> : (
                            <>
                                <Input readOnly value={details.address || '...'} className="font-mono text-xs" />
                                <Button variant="outline" size="icon" onClick={() => handleCopy(details.address || '')}>
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>USDT Balance</Label>
                        {details.loading ? <Skeleton className="h-9 w-full" /> : (
                            <div className="p-2 border rounded-md font-mono text-sm">{details.usdtBalance ?? '...'}</div>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label>BNB Balance (Gas)</Label>
                        {details.loading ? <Skeleton className="h-9 w-full" /> : (
                             <div className="p-2 border rounded-md font-mono text-sm">{details.bnbBalance ?? '...'}</div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function SendForm({ usdtAccounts }: { usdtAccounts: Account[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);
    const [state, formAction] = useActionState<SendRequestState, FormData>(createSendRequest, undefined);
    
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [selectedAddress, setSelectedAddress] = React.useState<string | undefined>(undefined);
    const [addressInput, setAddressInput] = React.useState('');

    React.useEffect(() => {
        if (state?.error) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
            formRef.current?.reset();
            setSelectedClient(null);
            setSelectedAddress(undefined);
            setAddressInput('');
        }
    }, [state, toast]);
    
    React.useEffect(() => {
        const handleAddressChange = async () => {
            if (ethers.isAddress(addressInput)) {
                const foundClient = await findClientByAddress(addressInput);
                if (foundClient) {
                    setSelectedClient(foundClient);
                    setSelectedAddress(addressInput);
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Client Not Found',
                        description: 'No client is associated with this address.',
                    });
                }
            }
        };
        const timerId = setTimeout(() => {
            if (addressInput) handleAddressChange();
        }, 500); // Debounce to avoid too many requests
        return () => clearTimeout(timerId);
    }, [addressInput, toast]);

    const handleClientSelect = (client: Client | null) => {
        setSelectedClient(client);
        if (client) {
            const primaryAddress = client.serviceProviders?.find(sp => sp.providerType === 'Crypto')?.details['Address'];
            setSelectedAddress(primaryAddress);
            setAddressInput(primaryAddress || '');
        } else {
            setSelectedAddress(undefined);
            setAddressInput('');
        }
    };
    
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
        <Card>
            <CardHeader>
                <CardTitle>Send USDT</CardTitle>
                <CardDescription>Select a client or paste an address, then enter the amount to send.</CardDescription>
            </CardHeader>
            <form ref={formRef} action={formAction}>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="creditAccountId">Recording Account</Label>
                        <Select name="creditAccountId" required>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a USDT wallet to record this to..." />
                            </SelectTrigger>
                            <SelectContent>
                                {usdtAccounts.map(account => (
                                    <SelectItem key={account.id} value={account.id}>
                                        {account.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {state?.errors?.creditAccountId && <p className="text-destructive text-sm">{state.errors.creditAccountId[0]}</p>}
                    </div>

                     <div className="space-y-2">
                        <Label htmlFor="client">Client</Label>
                        <ClientSelector selectedClient={selectedClient} onSelect={handleClientSelect} />
                    </div>

                    <div className="space-y-2">
                        <Label>Recipient Address</Label>
                        <div className="flex items-center gap-2">
                            <Input
                                name="recipientAddress"
                                placeholder="Or paste address here..."
                                value={addressInput}
                                onChange={(e) => setAddressInput(e.target.value)}
                                className="font-mono text-xs"
                            />
                             <Button type="button" variant="outline" size="icon" onClick={handlePaste}>
                                <ClipboardPaste className="h-4 w-4" />
                            </Button>
                        </div>
                        {state?.errors?.recipientAddress && <p className="text-destructive text-sm">{state.errors.recipientAddress[0]}</p>}
                    </div>

                    {selectedClient && selectedClient.serviceProviders && (
                         <div className="space-y-2 pl-2">
                             <Label>Choose from saved addresses:</Label>
                             <RadioGroup
                                onValueChange={(value) => {
                                    setSelectedAddress(value);
                                    setAddressInput(value);
                                }}
                                value={selectedAddress}
                                className="space-y-2"
                             >
                                 {selectedClient.serviceProviders.filter(sp => sp.providerType === 'Crypto' && sp.details.Address).map(sp => (
                                     <div key={sp.details.Address} className="flex items-center space-x-2 p-2 border rounded-md has-[[data-state=checked]]:bg-muted">
                                         <RadioGroupItem value={sp.details.Address} id={sp.details.Address} />
                                         <Label htmlFor={sp.details.Address} className="font-mono text-xs break-all">{sp.details.Address}</Label>
                                     </div>
                                 ))}
                             </RadioGroup>
                         </div>
                    )}
                    
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount (USDT)</Label>
                        <Input id="amount" name="amount" type="number" step="any" placeholder="e.g., 100.00" required />
                         {state?.errors?.amount && <p className="text-destructive text-sm">{state.errors.amount[0]}</p>}
                    </div>
                </CardContent>
                <CardFooter>
                    <SendButton />
                </CardFooter>
            </form>
        </Card>
    );
}

function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [open, setIsOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState(selectedClient?.name || "");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);

    const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
        setInputValue(selectedClient?.name || '');
    }, [selectedClient]);

    React.useEffect(() => {
        if (inputValue.length < 2) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        
        debounceTimeoutRef.current = setTimeout(async () => {
            const results = await searchClients(inputValue);
            setSearchResults(results);
            setIsLoading(false);
        }, 300);

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [inputValue]);

    const handleSelect = (client: Client) => {
        onSelect(client);
        setIsOpen(false);
        setInputValue(client.name);
    };
    
    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    return (
        <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
                    {selectedClient ? selectedClient.name : "Select client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search client by name or phone..." value={inputValue} onValueChange={setInputValue} />
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && searchResults.length === 0 && inputValue.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={`${client.name} ${getPhone(client.phone)}`} onSelect={() => handleSelect(client)}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                        <span>{client.name}</span>
                                        <span className="text-xs text-muted-foreground">{getPhone(client.phone)}</span>
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


function TransactionHistory() {
    const [history, setHistory] = React.useState<SendRequest[]>([]);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const historyRef = query(ref(db, 'send_requests'), orderByChild('timestamp'), limitToLast(20));
        const unsubscribe = onValue(historyRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: SendRequest[] = Object.keys(data)
                    .map(key => ({ id: key, ...data[key] }))
                    .sort((a,b) => b.timestamp - a.timestamp); // Sort descending
                setHistory(list);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const getStatusVariant = (status: SendRequest['status']) => {
        switch(status) {
            case 'sent': return 'default';
            case 'failed': return 'destructive';
            case 'pending': return 'secondary';
            default: return 'secondary';
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Transaction History</CardTitle>
                <CardDescription>Shows the last 20 transactions initiated from this wallet.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>To Address</TableHead>
                                <TableHead>Amount</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Tx Hash</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading history...</TableCell></TableRow>
                            ) : history.length > 0 ? (
                                history.map(tx => (
                                    <TableRow key={tx.id}>
                                        <TableCell title={format(new Date(tx.timestamp), 'PPpp')}>
                                            {formatDistanceToNow(new Date(tx.timestamp), { addSuffix: true })}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs truncate max-w-xs">{tx.to}</TableCell>
                                        <TableCell className="font-mono">{tx.amount.toFixed(2)} USDT</TableCell>
                                        <TableCell><Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            {tx.txHash && (
                                                <Button asChild variant="ghost" size="icon">
                                                    <a href={`https://bscscan.com/tx/${tx.txHash}`} target="_blank" rel="noopener noreferrer">
                                                        <ExternalLink className="h-4 w-4" />
                                                    </a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">No transactions yet.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export function WalletView({ usdtAccounts }: { usdtAccounts: Account[] }) {
    const [walletDetails, setWalletDetails] = React.useState<WalletDetailsState>({ loading: true });

    const refreshDetails = React.useCallback(async () => {
        setWalletDetails({ loading: true });
        const details = await getWalletDetails();
        setWalletDetails(details);
    }, []);

    React.useEffect(() => {
        refreshDetails();
    }, [refreshDetails]);

    return (
        <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex flex-col gap-6">
               <WalletInfoCard details={walletDetails} onRefresh={refreshDetails} />
               <SendForm usdtAccounts={usdtAccounts} />
            </div>
            <div className="md:col-span-2">
                <TransactionHistory />
            </div>
        </div>
    );
}
