

'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernCashRecordsTable } from "@/components/modern-cash-records-table";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { processIncomingSms, type ProcessSmsState } from '@/lib/actions';
import { deleteAllModernCashRecords, type CleanupState } from '@/lib/actions/utility';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function ProcessSmsButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Processing...' : 'Process Incoming SMS'}
        </Button>
    )
}

function DeleteAllButton() {
    const { pending } = useFormStatus();
    return (
        <AlertDialogAction asChild>
            <Button type="submit" disabled={pending} variant="destructive">
                <Trash2 className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
                {pending ? 'Deleting...' : 'Confirm Deletion'}
            </Button>
        </AlertDialogAction>
    );
}

function ProcessSmsForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<ProcessSmsState, FormData>(processIncomingSms, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Processing Failed' : 'Processing Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <ProcessSmsButton />
        </form>
    );
}

function DeleteAllForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<CleanupState, FormData>(deleteAllModernCashRecords, undefined);
    const [dialogOpen, setDialogOpen] = React.useState(false);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Error' : 'Success',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
             setDialogOpen(false);
        }
    }, [state, toast]);
    
    return (
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <AlertDialogTrigger asChild>
                <Button variant="destructive">
                     <Trash2 className="mr-2 h-4 w-4" />
                    Delete All & Reset
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                 <form action={formAction}>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete all cash records and reset the ID counter to 0.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <DeleteAllButton />
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    )
}

export default function ModernCashRecordsPage() {
    return (
        <>
            <PageHeader
                title="Cash Records"
                description="A unified ledger for all cash inflows and outflows from any source."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <ProcessSmsForm />
                    <Button asChild>
                        <Link href="/cash-records/inflow">
                            <ArrowDownToLine className="mr-2 h-4 w-4" />
                            New Inflow
                        </Link>
                    </Button>
                     <Button asChild variant="outline">
                        <Link href="/cash-records/outflow">
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            New Outflow
                        </Link>
                    </Button>
                     <DeleteAllForm />
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading records...</div>}>
                 <ModernCashRecordsTable />
            </Suspense>
        </>
    );
}
