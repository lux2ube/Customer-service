
'use client';

import * as React from 'react';
import type { CashRecord, Client } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { linkSmsToClient, matchSmsToClients, type MatchSmsState } from '@/lib/actions';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Check, ChevronsUpDown, Loader2, Link as LinkIcon, User, Users } from 'lucide-react';
import { cn, normalizeArabic } from '@/lib/utils';
import { useActionState, useFormStatus } from 'react';

interface MatchSuggestion extends CashRecord {
    suggestedClient?: Client | null;
    matchScore: number;
}

function findBestMatch(record: CashRecord, allClients: Client[]): { client: Client; score: number } | null {
    const recordName = record.senderName || record.recipientName;
    if (!recordName) return null;

    const normalizedRecordName = normalizeArabic(recordName);
    let bestMatch = null;
    let highestScore = 0;

    for (const client of allClients) {
        const normalizedClientName = normalizeArabic(client.name);
        
        // Perfect match
        if (normalizedRecordName === normalizedClientName) {
            return { client, score: 100 };
        }
        
        // Simple containment check
        if (normalizedClientName.includes(normalizedRecordName) || normalizedRecordName.includes(normalizedClientName)) {
            const score = Math.min(normalizedRecordName.length, normalizedClientName.length) / Math.max(normalizedRecordName.length, normalizedClientName.length) * 90;
            if (score > highestScore) {
                highestScore = score;
                bestMatch = client;
            }
        }
    }
    
    return bestMatch ? { client: bestMatch, score: highestScore } : null;
}

function AutoMatchButton() {
    const { pending } = useFormStatus();
    return (
        <Button disabled={pending} type="submit">
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
            Auto-Match All
        </Button>
    )
}

export function SmsMatchingView({ initialRecords, allClients }: { initialRecords: CashRecord[], allClients: Client[] }) {
    const [records, setRecords] = React.useState<MatchSuggestion[]>([]);
    const { toast } = useToast();
    const [state, formAction] = useActionState<MatchSmsState, FormData>(matchSmsToClients, undefined);


    React.useEffect(() => {
        if (state?.message) {
            toast({ title: state.error ? 'Error' : 'Success', description: state.message, variant: state.error ? 'destructive' : 'default' });
        }
    }, [state, toast]);

    React.useEffect(() => {
        const suggestions = initialRecords.map(record => {
            const match = findBestMatch(record, allClients);
            return {
                ...record,
                suggestedClient: match?.client,
                matchScore: match?.score || 0
            };
        }).sort((a,b) => b.matchScore - a.matchScore);
        setRecords(suggestions);
    }, [initialRecords, allClients]);
    
    const handleConfirm = async (recordId: string, clientId: string) => {
        const result = await linkSmsToClient(recordId, clientId);
        if(result.success) {
            setRecords(prev => prev.filter(r => r.id !== recordId));
            toast({ title: 'Success!', description: 'Record matched.'});
        } else {
            toast({ title: 'Error', description: result.message, variant: 'destructive'});
        }
    }
    
    return (
         <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Auto-Matching</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Automatically match all pending SMS records where the sender/receiver name exactly matches a client's name.
                    </p>
                </CardContent>
                <CardFooter>
                    <form action={formAction}>
                        <AutoMatchButton />
                    </form>
                </CardFooter>
            </Card>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map(record => (
                <Card key={record.id}>
                    <CardHeader>
                        <CardTitle className="text-lg">{record.amount.toLocaleString()} {record.currency}</CardTitle>
                        <p className="text-sm text-muted-foreground">From: {record.senderName || record.recipientName}</p>
                         <p className="text-xs text-muted-foreground pt-1">{format(new Date(record.date), 'PPP p')}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-3 bg-muted/50 rounded-md">
                            <h4 className="text-sm font-semibold mb-2">Suggested Match</h4>
                            {record.suggestedClient ? (
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4 text-primary" />
                                        <span className="font-medium">{record.suggestedClient.name}</span>
                                    </div>
                                    <Button size="sm" onClick={() => handleConfirm(record.id, record.suggestedClient!.id)}>
                                        <LinkIcon className="mr-2 h-4 w-4"/> Confirm
                                    </Button>
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">No confident match found.</p>
                            )}
                        </div>
                         <div>
                            <h4 className="text-sm font-semibold mb-2">Manual Match</h4>
                            <ManualClientSelector allClients={allClients} onSelect={(client) => handleConfirm(record.id, client.id)} />
                        </div>
                    </CardContent>
                </Card>
            ))}
             {records.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3 text-center py-12 text-muted-foreground">
                    <p>No pending SMS records to match.</p>
                </div>
            )}
        </div>
       </div>
    );
}

function ManualClientSelector({ allClients, onSelect }: { allClients: Client[], onSelect: (client: Client) => void }) {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<Client[]>([]);
    
    React.useEffect(() => {
        if(value.length > 1) {
            const normalizedSearch = normalizeArabic(value.toLowerCase().trim());
            const results = allClients.filter(c => normalizeArabic(c.name.toLowerCase()).includes(normalizedSearch));
            setSearchResults(results.slice(0, 10));
        } else {
            setSearchResults([]);
        }
    }, [value, allClients]);
    
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    Search for a client...
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search client..." onValueChange={setValue} />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                            {searchResults.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={() => {
                                        onSelect(client);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className="mr-2 h-4 w-4 opacity-0" />
                                    {client.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
