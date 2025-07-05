'use client';

import React from 'react';
import { useFormStatus, useFormState } from 'react-dom';
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
    const action = sendWhatsAppNotification.bind(null, transactionId);
    const [state, formAction] = useFormState<WhatsAppSendState, string>(action, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.success ? 'Success' : 'Error',
                description: state.message,
                variant: state.success ? 'default' : 'destructive',
            });
        }
    }, [state, toast]);

    if (!transactionId) return null;

    return (
        <form action={formAction}>
            <SubmitButton />
        </form>
    );
}
