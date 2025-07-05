'use client';

import React from 'react';
import { useFormStatus, useActionState } from 'react';
import { Button } from './ui/button';
import { sendWhatsAppNotification, type WhatsAppSendState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, Loader2 } from 'lucide-react';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
            ) : (
                <><MessageCircle className="mr-2 h-4 w-4" /> Send WhatsApp Notification</>
            )}
        </Button>
    )
}

export function WhatsAppSendButton({ transactionId }: { transactionId: string }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<WhatsAppSendState, FormData>(sendWhatsAppNotification, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Error' : 'Success',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    if (!transactionId) return null;

    return (
        <form action={formAction}>
            <input type="hidden" name="transactionId" value={transactionId} />
            <SubmitButton />
        </form>
    );
}
