
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { ArrowRightLeft, Save, Loader2, Check, ChevronsUpDown, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, Account, FiatRate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { Separator } from './ui/separator';
import { searchClients } from '@/lib/actions';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Transaction
                </>
            )}
        </Button>
    );
}

function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null, onSelect: (client: Client | null) => void }) {
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
            if (results.length > 0) {
              setIsOpen(true);
            }
        }, 300);

        return () => {
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [inputValue]);
    
    const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(', ') : phone || '';

    const handleSelect = (client: Client) => {
        onSelect(client);
        setIsOpen(false);
        setInputValue(client.name);
    };

    return (
        <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {selectedClient ? selectedClient.name : "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput
                        placeholder="Search client by name or phone..."
                        value={inputValue}
                        onValueChange={setInputValue}
                    />
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && searchResults.length === 0 && inputValue.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => handleSelect(client)}>
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

export function ExchangeForm({ clients, accounts }: { clients: Client[], accounts: Account[] }) {
    const { toast } = useToast();
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);

    return (
        <form>
             <Card>
                <CardHeader>
                    <CardTitle>Currency Exchange</CardTitle>
                    <CardDescription>Record a currency purchase or sale transaction.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        {/* They Give Section */}
                        <Card className="h-full bg-muted/20">
                            <CardHeader>
                                <CardTitle className="text-base text-green-600">They Give (Client Pays)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Amount Received</Label>
                                    <Input type="number" placeholder="e.g., 200" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Currency</Label>
                                    <Select>
                                        <SelectTrigger><SelectValue placeholder="Select currency..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">US Dollar (USD)</SelectItem>
                                            <SelectItem value="YER">Yemeni Rial (YER)</SelectItem>
                                            <SelectItem value="SAR">Saudi Riyal (SAR)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Received Into Account</Label>
                                    <Select>
                                        <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                        <SelectContent>
                                            {accounts.filter(a => a.type === 'Assets').map(account => (
                                                <SelectItem key={account.id} value={account.id}>{account.name} ({account.currency})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>

                        {/* They Get Section */}
                        <Card className="h-full bg-muted/20">
                            <CardHeader>
                                <CardTitle className="text-base text-red-600">They Get (We Pay)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Amount Paid</Label>
                                    <Input type="number" placeholder="e.g., 11100" readOnly className="bg-muted" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Currency</Label>
                                    <Select>
                                        <SelectTrigger><SelectValue placeholder="Select currency..." /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="YER">Yemeni Rial (YER)</SelectItem>
                                            <SelectItem value="SAR">Saudi Riyal (SAR)</SelectItem>
                                            <SelectItem value="USD">US Dollar (USD)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Paid From Account</Label>
                                    <Select>
                                        <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                        <SelectContent>
                                            {accounts.filter(a => a.type === 'Assets').map(account => (
                                                <SelectItem key={account.id} value={account.id}>{account.name} ({account.currency})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Separator className="my-6" />

                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-2 md:col-span-1">
                            <Label>Client</Label>
                            <ClientSelector selectedClient={selectedClient} onSelect={setSelectedClient} />
                        </div>
                        <div className="space-y-2">
                            <Label>Exchange Rate</Label>
                            <Input type="number" placeholder="e.g., 555" />
                        </div>
                        <div className="space-y-2">
                            <Label>Reference / Source</Label>
                            <Input placeholder="Optional reference" />
                        </div>
                    </div>
                     <div className="space-y-2 mt-4">
                        <Label>Notes</Label>
                        <Textarea placeholder="Add any notes for this transaction..." />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between items-center bg-muted/50 p-4 mt-4 border-t">
                    <div className="flex gap-2">
                         <Button variant="outline"><Printer className="mr-2 h-4 w-4" /> Print Invoice</Button>
                    </div>
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
