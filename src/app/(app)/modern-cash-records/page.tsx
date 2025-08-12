
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernCashRecordsTable } from "@/components/modern-cash-records-table";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { processIncomingSms, matchSmsToClients, type ProcessSmsState, type MatchSmsState } from '@/lib/actions';

function ProcessSmsButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Processing...' : 'Process Incoming SMS'}
        </Button>
    )
}

function MatchClientsButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <Users className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Matching...' : 'Match Clients'}
        </Button>
    )
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

function MatchClientsForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<MatchSmsState, FormData>(matchSmsToClients, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Matching Failed' : 'Matching Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <MatchClientsButton />
        </form>
    );
}


export default function ModernCashRecordsPage() {
    return (
        <>
            <PageHeader
                title="Modern Cash Records"
                description="A unified ledger for all cash inflows and outflows from any source."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <MatchClientsForm />
                    <ProcessSmsForm />
                    <Button asChild>
                        <Link href="/modern-cash-records/inflow">
                            <ArrowDownToLine className="mr-2 h-4 w-4" />
                            New Inflow
                        </Link>
                    </Button>
                     <Button asChild variant="outline">
                        <Link href="/modern-cash-records/outflow">
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            New Outflow
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading records...</div>}>
                 <ModernCashRecordsTable />
            </Suspense>
        </>
    );
}
