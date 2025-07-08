'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { mergeDuplicateClients, type MergeState } from '@/lib/actions';
import { Users2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <AlertDialogAction type="submit" disabled={pending}>
            {pending ? 'Merging...' : 'Yes, Merge Duplicates'}
        </AlertDialogAction>
    );
}

export function MergeClientsButton() {
    const [open, setOpen] = React.useState(false);
    const { toast } = useToast();
    const [state, formAction] = useActionState<MergeState, FormData>(mergeDuplicateClients, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Merge Failed' : 'Merge Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
            setOpen(false);
        }
    }, [state, toast]);

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Users2 className="mr-2 h-4 w-4" />
                Merge Duplicates
            </Button>
            <AlertDialog open={open} onOpenChange={setOpen}>
                <AlertDialogContent>
                    <form action={formAction}>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action will permanently merge all clients with the exact same name. It will combine their phone numbers and other data into a single client record and delete the duplicates. This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <SubmitButton />
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
