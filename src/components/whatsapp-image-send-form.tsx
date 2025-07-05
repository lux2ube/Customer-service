'use client';

import React from 'react';
import { useFormStatus, useActionState } from 'react';
import { Button } from './ui/button';
import { sendWhatsAppImage, type WhatsAppImageSendState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
            ) : (
                <><ImageIcon className="mr-2 h-4 w-4" /> Send Invoice Image</>
            )}
        </Button>
    )
}

export function WhatsAppImageSendForm({ transactionId }: { transactionId: string }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<WhatsAppImageSendState, FormData>(sendWhatsAppImage, undefined);
    const formRef = React.useRef<HTMLFormElement>(null);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Error' : 'Success',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
            if (state.success) {
                formRef.current?.reset();
            }
        }
    }, [state, toast]);

    if (!transactionId) return null;

    return (
        <form action={formAction} ref={formRef} className="space-y-4">
            <input type="hidden" name="transactionId" value={transactionId} />
            <div className="space-y-2">
                <Label htmlFor="imageUrl">JPG Invoice Weblink</Label>
                <Input
                    id="imageUrl"
                    name="imageUrl"
                    type="url"
                    placeholder="https://example.com/invoice.jpg"
                    required
                />
            </div>
            <SubmitButton />
        </form>
    );
}
