
'use client';

import * as React from 'react';
import { useFormStatus, useActionState } from 'react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';
import { updateBulkTransactions, type BulkUpdateState } from '@/lib/actions';
import { ChevronDown, Tag, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

interface TransactionBulkActionsProps {
    selectedIds: string[];
    onActionComplete: () => void;
}

function SubmitButton({ children }: { children: React.ReactNode }) {
    const { pending } = useFormStatus();
    return (
        <AlertDialogAction type="submit" disabled={pending}>
            {pending ? 'Applying...' : children}
        </AlertDialogAction>
    );
}

export function TransactionBulkActions({ selectedIds, onActionComplete }: TransactionBulkActionsProps) {
    const { toast } = useToast();
    const [action, setAction] = React.useState<'changeStatus' | null>(null);
    const [statusToSet, setStatusToSet] = React.useState<'Pending' | 'Confirmed' | 'Cancelled'>('Pending');
    const formRef = React.useRef<HTMLFormElement>(null);

    const [state, formAction] = useActionState<BulkUpdateState, FormData>(updateBulkTransactions, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Error' : 'Success',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
            if (!state.error) {
                onActionComplete();
                setAction(null);
            }
        }
    }, [state, toast, onActionComplete]);
    
    const handleStatusAction = (status: 'Pending' | 'Confirmed' | 'Cancelled') => {
        setStatusToSet(status);
        setAction('changeStatus');
    }

    return (
        <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
            <p className="text-sm font-medium">{selectedIds.length} selected</p>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">Actions <ChevronDown className="ml-2 h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => handleStatusAction('Confirmed')}>
                        <Pencil className="mr-2 h-4 w-4"/>
                        <span>Change Status to Confirmed</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleStatusAction('Pending')}>
                         <Pencil className="mr-2 h-4 w-4"/>
                        <span>Change Status to Pending</span>
                    </DropdownMenuItem>
                     <DropdownMenuItem onSelect={() => handleStatusAction('Cancelled')}>
                        <Pencil className="mr-2 h-4 w-4"/>
                        <span>Change Status to Cancelled</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Bulk Action</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to change the status of {selectedIds.length} transactions to "{statusToSet}"?
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form action={formAction} ref={formRef}>
                         <input type="hidden" name="status" value={statusToSet} />
                         {selectedIds.map(id => <input key={id} type="hidden" name="transactionIds" value={id} />)}
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <SubmitButton>Apply Changes</SubmitButton>
                        </AlertDialogFooter>
                    </form>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
