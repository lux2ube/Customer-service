
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernUsdtRecordsTable } from "@/components/modern-usdt-records-table";
import { CsvUsdtSyncForm } from "@/components/csv-usdt-sync-form";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { syncBscTransactions, deleteBscSyncedRecords, type SyncState } from '@/lib/actions';
import type { BscApiSetting } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


function SyncBscButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Syncing...' : 'Sync Wallet'}
        </Button>
    )
}

function DeleteSyncedButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" variant="destructive" disabled={pending}>
            <Trash2 className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Deleting...' : 'Delete Synced Records'}
        </Button>
    );
}

function DeleteSyncedForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState(deleteBscSyncedRecords, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Deletion Failed' : 'Deletion Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);
    
    return (
        <form action={formAction}>
            <DeleteSyncedButton />
        </form>
    )
}


function SyncBscForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SyncState, FormData>(syncBscTransactions, undefined);
    const [apiSettings, setApiSettings] = React.useState<BscApiSetting[]>([]);
    const [selectedApi, setSelectedApi] = React.useState('');

    React.useEffect(() => {
        const settingsRef = ref(db, 'bsc_apis');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list: BscApiSetting[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                setApiSettings(list);
                if (list.length > 0 && !selectedApi) {
                    setSelectedApi(list[0].id);
                }
            } else {
                setApiSettings([]);
            }
        });
        return () => unsubscribe();
    }, [selectedApi]);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Sync Failed' : 'Sync Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    if (apiSettings.length === 0) {
        return (
            <Button variant="outline" disabled>
                <RefreshCw className="mr-2 h-4 w-4" />
                No API Configured
            </Button>
        );
    }
    
    return (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
            <Select value={selectedApi} onValueChange={setSelectedApi}>
                <SelectTrigger className="w-full md:w-[250px]">
                    <SelectValue placeholder="Select a wallet to sync..." />
                </SelectTrigger>
                <SelectContent>
                    {apiSettings.map(api => (
                        <SelectItem key={api.id} value={api.id}>{api.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <input type="hidden" name="apiId" value={selectedApi} />
            <SyncBscButton />
        </form>
    );
}

export default function ModernUsdtRecordsPage() {
    return (
        <>
            <PageHeader
                title="USDT Records"
                description="A unified ledger for all USDT inflows and outflows from any source."
            >
                <div className="flex flex-col gap-4">
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
                        <DeleteSyncedForm />
                    </div>
                    <CsvUsdtSyncForm />
                </div>
            </PageHeader>
            <Suspense fallback={<div>Loading records...</div>}>
                 <ModernUsdtRecordsTable />
            </Suspense>
        </>
    );
}
