
'use client';

import * as React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { mergeDuplicateClients, type MergeState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Users2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { AlertCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

function SubmitButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            <Users2 className="mr-2 h-4 w-4" />
            {pending ? 'Merging...' : 'Merge All Duplicates'}
        </Button>
    );
}

export function ClientMergeView({ clients }: { clients: Client[] }) {
    const { toast } = useToast();
    const [state, formAction] = useFormState<MergeState, FormData>(mergeDuplicateClients, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Merge Failed' : 'Merge Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    const duplicateGroups = React.useMemo(() => {
        const clientsByName: Record<string, Client[]> = {};
        for (const client of clients) {
            if (!client.name) continue;
            const normalizedName = client.name.trim().toLowerCase();
            if (!clientsByName[normalizedName]) {
                clientsByName[normalizedName] = [];
            }
            clientsByName[normalizedName].push(client);
        }

        return Object.values(clientsByName)
            .filter(group => group.length > 1)
            .map(group => group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    }, [clients]);

    if (state?.success) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>Merge Complete</CardTitle>
                    <CardDescription>{state.message}</CardDescription>
                </CardHeader>
                 <CardContent>
                     <p className="text-sm">Please refresh the page to see the updated client list.</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <form action={formAction}>
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Review Duplicates</CardTitle>
                        <CardDescription>
                            The system has identified {duplicateGroups.length} group(s) of clients with identical names. The oldest record in each group is considered the "Primary" and will be kept. Data from duplicates will be merged into it.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="bg-muted/50 p-4 border-t">
                        <SubmitButton disabled={duplicateGroups.length === 0} />
                    </CardFooter>
                </Card>

                {duplicateGroups.length === 0 && !state && (
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>No Duplicates Found</AlertTitle>
                        <AlertDescription>The system did not find any clients with identical names to merge.</AlertDescription>
                    </Alert>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                    {duplicateGroups.map((group, index) => (
                        <Card key={index} className="flex flex-col">
                            <CardHeader>
                                <CardTitle>{group[0].name}</CardTitle>
                                <CardDescription>Primary Client ID: {group[0].id}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex-grow">
                                <ul className="space-y-2">
                                    {group.map((client, clientIndex) => (
                                        <li key={client.id} className={`p-2 rounded-md ${clientIndex === 0 ? 'bg-green-100 dark:bg-green-900/50 border border-green-400' : 'bg-red-100 dark:bg-red-900/50 border border-red-400'}`}>
                                            <p className="font-semibold text-sm">{clientIndex === 0 ? 'Primary Record' : 'Duplicate Record'}</p>
                                            <p className="text-xs text-muted-foreground">ID: {client.id}</p>
                                            <p className="text-xs text-muted-foreground">Phone(s): {(Array.isArray(client.phone) ? client.phone.join(', ') : client.phone) || 'N/A'}</p>
                                             <p className="text-xs text-muted-foreground">Created: {format(parseISO(client.createdAt), 'PPp')}</p>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </form>
    );
}
