
'use client';

import * as React from 'react';
import { useActionState, useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { createMexcTestDeposit, type MexcTestDepositState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Client, Account } from '@/lib/types';
import { Check, ChevronsUpDown, Loader2, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchClients } from '@/lib/actions';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Test Deposit...</>
            ) : (
                <><Save className="mr-2 h-4 w-4" />Create Test Deposit</>
            )}
        </Button>
    );
}

export function MexcTestDepositForm({ clients, bankAccounts }: { clients: Client[], bankAccounts: Account[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<MexcTestDepositState, FormData>(createMexcTestDeposit, undefined);
    const formRef = React.useRef<HTMLFormElement>(null);
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);

    React.useEffect(() => {
        if (state?.message && state?.error) {
            toast({ variant: 'destructive', title: 'Error', description: state.message });
        }
    }, [state, toast]);

    const handleClientSelect = (client: Client | null) => {
        setSelectedClient(client);
    };

    return (
        <form action={formAction} ref={formRef}>
            <Card>
                <CardHeader>
                    <CardTitle>Test Deposit Details</CardTitle>
                    <CardDescription>Fill out the details to create a deposit ready for review.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Client</Label>
                        <ClientSelector selectedClient={selectedClient} onSelect={handleClientSelect} />
                        <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
                        {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bankAccountId">Bank Account (Source)</Label>
                            <Select name="bankAccountId" required>
                                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount Received</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g. 50000" />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clientWalletAddress">Client Wallet Address (BEP20)</Label>
                        <Input 
                            id="clientWalletAddress" 
                            name="clientWalletAddress" 
                            required 
                            placeholder="0x..."
                            defaultValue={selectedClient?.bep20_addresses?.[0] || ''}
                        />
                        {state?.errors?.clientWalletAddress && <p className="text-sm text-destructive">{state.errors.clientWalletAddress[0]}</p>}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}

function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [search, setSearch] = React.useState(selectedClient?.name || "");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isOpen, setIsOpen] = React.useState(false);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!isOpen || search.trim().length < 2) {
            setSearchResults([]);
            if (search.trim().length === 0 && selectedClient) {
                onSelect(null);
            }
            return;
        }

        setIsLoading(true);
        const timerId = setTimeout(async () => {
            const results = await searchClients(search);
            setSearchResults(results);
            setIsLoading(false);
        }, 300);

        return () => clearTimeout(timerId);
    }, [search, isOpen, onSelect, selectedClient]);
    
    React.useEffect(() => {
        if (selectedClient) {
            setSearch(selectedClient.name || '');
        } else {
            setSearch("");
        }
    }, [selectedClient]);

    React.useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch(selectedClient?.name || "");
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef, selectedClient]);

    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    const handleSelect = (client: Client) => {
        onSelect(client);
        setIsOpen(false);
        setSearch(client.name);
    };

    return (
        <div className="relative" ref={wrapperRef}>
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={isOpen}
                        className="w-full justify-between font-normal"
                        onClick={() => setIsOpen(true)}
                    >
                        {selectedClient ? selectedClient.name : "Select a client..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command shouldFilter={false}>
                        <CommandInput 
                            placeholder="Search by name or phone..."
                            value={search}
                            onValueChange={setSearch}
                        />
                        <CommandList>
                            {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                            {!isLoading && searchResults.length === 0 && search.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                            <CommandGroup>
                                {searchResults.map(client => (
                                    <CommandItem
                                        key={client.id}
                                        value={client.id}
                                        onSelect={() => handleSelect(client)}
                                    >
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
        </div>
    );
}
