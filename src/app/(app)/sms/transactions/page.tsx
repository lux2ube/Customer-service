
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { SmsTransactionsTable } from "@/components/sms-transactions-table";
import { Suspense } from "react";
import { useActionState, useFormStatus } from 'react';
import { useToast } from '@/hooks/use-toast';
import { processIncomingSms, type ProcessSmsState } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

function ProcessSmsButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Processing...' : 'Process Incoming SMS'}
        </Button>
    )
}

function SmsProcessingForm() {
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


export default function SmsTransactionsPage() {
    return (
        <>
            <PageHeader
                title="SMS Transactions"
                description="View and manage transactions parsed from incoming SMS messages."
            >
                <SmsProcessingForm />
            </PageHeader>
            <Suspense fallback={<div>Loading transactions...</div>}>
                <SmsTransactionsTable />
            </Suspense>
        </>
    );
}
