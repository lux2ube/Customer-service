
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Bot } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernUsdtRecordsTable } from "@/components/modern-usdt-records-table";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { syncBscTransactions, type SyncState } from '@/lib/actions';

function SyncBscButton() {
    const { pending } = useFormStatus();
    return (
        <Button variant="outline" type="submit" disabled={pending}>
            <Bot className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Syncing...' : 'Sync with BSCScan'}
        </Button>
    )
}

function SyncBscForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SyncState, FormData>(syncBscTransactions, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Sync Failed' : 'Sync Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <SyncBscButton />
        </form>
    );
}

export default function ModernUsdtRecordsPage() {
    return (
        <>
            <PageHeader
                title="Modern USDT Records"
                description="A unified ledger for all USDT inflows and outflows from any source."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <SyncBscForm />
                    <Button asChild>
                        <Link href="/financial-records/usdt-manual-receipt">
                            <ArrowDownToLine className="mr-2 h-4 w-4" />
                            New Inflow
                        </Link>
                    </Button>
                     <Button asChild variant="outline">
                        <Link href="/financial-records/usdt-manual-payment">
                            <ArrowUpFromLine className="mr-2 h-4 w-4" />
                            New Outflow
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading records...</div>}>
                 <ModernUsdtRecordsTable />
            </Suspense>
        </>
    );
}
