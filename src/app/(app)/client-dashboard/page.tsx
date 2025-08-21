

'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { searchClients } from '@/lib/actions';
import type { Client, JournalEntry } from '@/lib/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, X, ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, query } from 'firebase/database';
import { QuickAddCashInflow } from '@/components/quick-add-cash-inflow';
import { QuickAddCashOutflow } from '@/components/quick-add-cash-outflow';
import { QuickAddUsdtInflow } from '@/components/quick-add-usdt-inflow';
import { QuickAddUsdtOutflow } from '@/components/quick-add-usdt-outflow';
import { Badge } from '@/components/ui/badge';
import { FinancialRecordsTable } from '@/components/financial-records-table';

type ActiveAction = 'cash-in' | 'cash-out' | 'usdt-in' | 'usdt-out' | null;

function ClientSelector({ selectedClient, onSelect }: { selectedClient: Client | null; onSelect: (client: Client | null) => void; }) {
    const [open, setIsOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState("");
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    
    const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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
    
    const handleClear = () => {
        onSelect(null);
        setInputValue('');
    }

    return (
        <Popover open={open} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                 <div className="relative w-full max-w-lg">
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder="Search client by name, phone, or ID..."
                            value={inputValue}
                            onValueChange={setInputValue}
                        />
                    </Command>
                    {selectedClient && (
                         <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7" onClick={handleClear}>
                            <X className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandList>
                        {isLoading && <CommandEmpty>Searching...</CommandEmpty>}
                        {!isLoading && searchResults.length === 0 && inputValue.length > 1 && <CommandEmpty>No client found.</CommandEmpty>}
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => handleSelect(client)}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    <div className="flex flex-col">
                                        <span>{client.name}</span>
                                        <span className="text-xs text-muted-foreground">{Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}</span>
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

function ClientDetailsCard({ client, balance }: { client: Client | null, balance: number }) {
    if (!client) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>No Client Selected</CardTitle>
                    <CardDescription>Use the search bar above to find and select a client.</CardDescription>
                </CardHeader>
            </Card>
        );
    }
    
     const getStatusVariant = (status: Client['verification_status']) => {
        switch(status) {
            case 'Active': return 'default';
            case 'Inactive': return 'destructive';
            case 'Pending': return 'secondary';
            default: return 'secondary';
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>{client.name}</CardTitle>
                        <CardDescription>ID: {client.id}</CardDescription>
                    </div>
                     <Badge variant={getStatusVariant(client.verification_status)}>{client.verification_status}</Badge>
                </div>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
                <div>
                    <Label className="text-xs">Phone Number(s)</Label>
                    <p className="font-medium">{Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}</p>
                </div>
                 <div className="text-right">
                    <Label className="text-xs">Account Balance</Label>
                    <p className="font-bold text-2xl font-mono">${balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                </div>
            </CardContent>
        </Card>
    )
}

function ActionsCard({ client, onActionSelect }: { 
    client: Client | null, 
    onActionSelect: (action: ActiveAction) => void
}) {
    if (!client) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Button variant="outline" onClick={() => onActionSelect('cash-in')}>
                    <ArrowDown className="mr-2 h-4 w-4 text-green-500" />
                    Cash Inflow
                </Button>
                <Button variant="outline" onClick={() => onActionSelect('cash-out')}>
                     <ArrowUp className="mr-2 h-4 w-4 text-red-500" />
                    Cash Outflow
                </Button>
                 <Button variant="outline" onClick={() => onActionSelect('usdt-in')}>
                     <ArrowDown className="mr-2 h-4 w-4 text-green-500" />
                    USDT Inflow
                </Button>
                 <Button variant="outline" onClick={() => onActionSelect('usdt-out')}>
                     <ArrowUp className="mr-2 h-4 w-4 text-red-500" />
                    USDT Outflow
                </Button>
            </CardContent>
        </Card>
    );
}

function ActionSection({ 
    activeAction, 
    client, 
    onClose, 
    onActionSuccess,
}: {
    activeAction: ActiveAction,
    client: Client | null,
    onClose: () => void,
    onActionSuccess: () => void,
}) {
    if (!activeAction || !client) return null;
    
    const titles: Record<NonNullable<ActiveAction>, string> = {
        'cash-in': 'Add Cash Inflow',
        'cash-out': 'Add Cash Outflow',
        'usdt-in': 'Add USDT Inflow',
        'usdt-out': 'Add USDT Outflow',
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>{titles[activeAction]} for {client.name}</CardTitle>
                    <Button variant="ghost" size="icon" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {activeAction === 'cash-in' && <QuickAddCashInflow client={client} onRecordCreated={onActionSuccess} setIsOpen={onClose} />}
                {activeAction === 'cash-out' && <QuickAddCashOutflow client={client} onRecordCreated={onActionSuccess} setIsOpen={onClose} />}
                {activeAction === 'usdt-in' && <QuickAddUsdtInflow client={client} onRecordCreated={onActionSuccess} setIsOpen={onClose} />}
                {activeAction === 'usdt-out' && <QuickAddUsdtOutflow client={client} onRecordCreated={onActionSuccess} setIsOpen={onClose} />}
            </CardContent>
        </Card>
    );
}

export default function ClientDashboardPage() {
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
    const [clientBalance, setClientBalance] = React.useState(0);
    const [activeAction, setActiveAction] = React.useState<ActiveAction>(null);
    
    // This state is now only used to re-fetch the *balance*, not the records table.
    const [refreshKey, setRefreshKey] = React.useState(0);

    const handleClientSelect = (client: Client | null) => {
        setSelectedClient(client);
        setActiveAction(null);
    };
    
     React.useEffect(() => {
        if (!selectedClient) {
            setClientBalance(0);
            return;
        }

        const clientAccountId = `6000${selectedClient.id}`;
        const journalQuery = query(ref(db, 'journal_entries'));
        
        const unsubscribe = onValue(journalQuery, (snapshot) => {
            let balance = 0;
            if (snapshot.exists()) {
                const allEntries: Record<string, JournalEntry> = snapshot.val();
                for (const key in allEntries) {
                    const entry = allEntries[key];
                    if (entry.credit_account === clientAccountId) {
                        balance += entry.amount_usd;
                    }
                    if (entry.debit_account === clientAccountId) {
                        balance -= entry.amount_usd;
                    }
                }
            }
            setClientBalance(balance);
        });

        return () => unsubscribe();

    }, [selectedClient, refreshKey]);

    const handleActionSuccess = () => {
        setRefreshKey(prev => prev + 1); // Triggers balance re-fetch
        setActiveAction(null);
    }
    
    const handleActionSelect = (action: ActiveAction) => {
        setActiveAction(prev => prev === action ? null : action);
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Client Dashboard"
                description="Search for a client to view their complete financial history and perform actions."
            />
            
            <ClientSelector selectedClient={selectedClient} onSelect={handleClientSelect} />
            
            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <ClientDetailsCard client={selectedClient} balance={clientBalance} />
                     {selectedClient && <ActionsCard client={selectedClient} onActionSelect={handleActionSelect} />}
                     {selectedClient && <FinancialRecordsTable client={selectedClient} onTransactionCreated={handleActionSuccess} />}
                </div>
                <div className="lg:col-span-1 space-y-6">
                    {activeAction && (
                         <ActionSection
                            activeAction={activeAction}
                            client={selectedClient}
                            onClose={() => setActiveAction(null)}
                            onActionSuccess={handleActionSuccess}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
