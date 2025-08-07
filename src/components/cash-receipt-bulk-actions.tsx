
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/dropdown-menu';
import { updateBulkSmsStatus, type BulkUpdateState } from '@/lib/actions';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
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
import type { UnifiedReceipt } from './cash-receipts-table';

interface CashReceiptBulkActionsProps {
    selectedReceipts: UnifiedReceipt[];
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

export function CashReceiptBulkActions({ selectedReceipts, onActionComplete }: CashReceiptBulkActionsProps) {
    const { toast } = useToast();
    const [action, setAction] = React.useState<'changeSmsStatus' | null>(null);
    const [statusToSet, setStatusToSet] = React.useState<'used' | 'rejected'>('used');
    const formRef = React.useRef<HTMLFormElement>(null);
    
    // Filter for SMS records that can be actioned upon
    const actionablesmsIds = selectedReceipts.filter(r => r.source === 'SMS' && (r.status === 'parsed' || r.status === 'matched')).map(r => r.id);

    const [state, formAction] = React.useActionState<BulkUpdateState, FormData>(updateBulkSmsStatus, undefined);

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
    
    const handleStatusAction = (status: 'used' | 'rejected') => {
        if (actionablesmsIds.length === 0) {
            toast({
                variant: "destructive",
                title: "No eligible SMS selected",
                description: "This action only applies to SMS receipts with 'parsed' or 'matched' status.",
            });
            return;
        }
        setStatusToSet(status);
        setAction('changeSmsStatus');
    }

    return (
        <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
            <p className="text-sm font-medium">{selectedReceipts.length} selected</p>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">Actions <ChevronDown className="ml-2 h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => handleStatusAction('used')}>
                        <Pencil className="mr-2 h-4 w-4"/>
                        <span>Mark SMS as Used</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleStatusAction('rejected')}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive"/>
                        <span className="text-destructive">Mark SMS as Rejected</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={!!action} onOpenChange={(open) => !open && setAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Bulk Action</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to change the status of {actionablesmsIds.length} SMS receipt(s) to "{statusToSet}"?
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <form action={formAction} ref={formRef}>
                         <input type="hidden" name="status" value={statusToSet} />
                         {actionablesmsIds.map(id => <input key={id} type="hidden" name="smsIds" value={id} />)}
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
