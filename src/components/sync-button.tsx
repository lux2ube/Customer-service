
'use client';

import React from 'react';
import { useFormStatus, useFormState } from 'react-dom';
import { Button } from './ui/button';
import { syncBscTransactions, type SyncState } from '@/lib/actions';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Syncing...' : 'Sync with BSCScan'}
        </Button>
    )
}

export function SyncButton() {
    const { toast } = useToast();
    const [state, formAction] = useFormState<SyncState, FormData>(syncBscTransactions, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Sync Failed' : 'Sync Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <SubmitButton />
        </form>
    );
}
