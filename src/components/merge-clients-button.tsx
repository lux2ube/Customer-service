
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { mergeDuplicateClients, type MergeState } from '@/lib/actions';
import { Users2, ArrowRight } from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose
} from '@/components/ui/dialog';
import { ScrollArea } from './ui/scroll-area';

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
    const [results, setResults] = React.useState<MergeState['mergedGroups'] | undefined>(undefined);
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
            if (state.mergedGroups && state.mergedGroups.length > 0) {
                setResults(state.mergedGroups);
            }
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

            <Dialog open={!!results} onOpenChange={(open) => !open && setResults(undefined)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Merge Results</DialogTitle>
                        <DialogDescription>
                            The following clients have been merged. The "Primary Client" is the record that was kept and updated.
                        </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh]">
                        <div className="space-y-4 pr-6">
                            {results?.map((group, index) => (
                                <div key={index} className="rounded-lg border p-4">
                                    <h3 className="font-semibold text-primary">{group.primaryClient.name}</h3>
                                    <p className="text-xs text-muted-foreground mb-2">Primary Client ID: {group.primaryClient.id}</p>
                                    <div className="space-y-1">
                                        {group.duplicates.map(dup => (
                                             <div key={dup.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <ArrowRight className="h-4 w-4 text-destructive" />
                                                <span>Merged duplicate with ID: <span className="font-mono">{dup.id}</span></span>
                                             </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button>Close</Button>
                        </DialogClose>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
