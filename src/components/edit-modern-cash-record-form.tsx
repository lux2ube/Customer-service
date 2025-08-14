
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, ModernCashRecord } from '@/lib/types';
import { updateModernCashRecord, searchClients } from '@/lib/actions';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {pending ? 'Saving...' : 'Save Changes'}
        </Button>
    );
}

function ClientSelector({ clients, value, onValueChange, selectedClient, onSelect }: { clients: Client[]; value: string; onValueChange: (search: string) => void; selectedClient: Client | null; onSelect: (client: Client) => void; }) {
    const [open, setOpen] = React.useState(false);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                 <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    {value || "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search clients..." value={value} onValueChange={onValueChange} />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                            {clients.map(client => (
                                <CommandItem key={client.id} value={client.name} onSelect={() => { onSelect(client); setOpen(false); }}>
                                    <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                                    <span>{client.name}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function EditModernCashRecordForm({ record, clients }: { record: ModernCashRecord, clients: Client[] }) {
    const { toast } = useToast();
    const actionWithId = updateModernCashRecord.bind(null, record.id);
    const [state, formAction] = useActionState(actionWithId, undefined);
    
    const [selectedClient, setSelectedClient] = React.useState<Client | null>(() => clients.find(c => c.id === record.clientId) || null);
    const [clientSearch, setClientSearch] = React.useState(() => clients.find(c => c.id === record.clientId)?.name || "");
    const [filteredClients, setFilteredClients] = React.useState(clients);

    React.useEffect(() => {
        if (clientSearch.length > 1) {
            searchClients(clientSearch).then(setFilteredClients);
        } else {
            setFilteredClients(clients);
        }
    }, [clientSearch, clients]);
    
     React.useEffect(() => {
        if (state?.success) {
            toast({ title: 'Success', description: state.message });
        } else if (state?.message) {
            toast({ title: 'Error', variant: 'destructive', description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
             <Card>
                <CardHeader>
                    <CardTitle>Edit Cash Record</CardTitle>
                    <CardDescription>Update the client, status, or notes for this record.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input value={format(new Date(record.date), "PPP p")} disabled />
                        </div>
                        <div className="space-y-2">
                             <Label>Amount</Label>
                             <Input value={`${record.amount.toLocaleString()} ${record.currency}`} disabled />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label>Sender / Recipient</Label>
                        <Input value={record.senderName || record.recipientName || 'N/A'} disabled />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="clientId">Client</Label>
                        <ClientSelector 
                            clients={filteredClients}
                            value={clientSearch}
                            onValueChange={setClientSearch}
                            selectedClient={selectedClient}
                            onSelect={(client) => {
                                setSelectedClient(client);
                                setClientSearch(client.name);
                            }}
                        />
                         <input type="hidden" name="clientId" value={selectedClient?.id || ''} />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select name="status" defaultValue={record.status}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Matched">Matched</SelectItem>
                                    <SelectItem value="Used">Used</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Notes</Label>
                            <Textarea id="notes" name="notes" defaultValue={record.notes || ''} />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
