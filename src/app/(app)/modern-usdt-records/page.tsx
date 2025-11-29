export const revalidate = 0;

'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Trash2, Link2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ModernUsdtRecordsTable } from "@/components/modern-usdt-records-table";
import { CsvUsdtSyncForm } from "@/components/csv-usdt-sync-form";
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { syncBscTransactions, deleteBscSyncedRecords, type SyncState } from '@/lib/actions';
import type { BscApiSetting, UsdtRecord, Client } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get, update } from 'firebase/database';
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

function AutoMatchButton() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = React.useState(false);

    const handleAutoMatch = async () => {
        setIsLoading(true);
        try {
            // Get all unassigned records
            const recordsSnapshot = await get(ref(db, 'modern_usdt_records'));
            const unassignedRecords: (UsdtRecord & { id: string })[] = [];
            
            if (recordsSnapshot.exists()) {
                const data = recordsSnapshot.val();
                Object.keys(data).forEach(key => {
                    const record = { id: key, ...data[key] };
                    if (record.clientName === 'Unassigned' || !record.clientId) {
                        unassignedRecords.push(record);
                    }
                });
            }

            if (unassignedRecords.length === 0) {
                toast({
                    title: 'No Unassigned Records',
                    description: 'All transactions are already assigned',
                });
                setIsLoading(false);
                return;
            }

            // Get all clients
            const clientsSnapshot = await get(ref(db, 'clients'));
            const clients: { [key: string]: Client & { id: string } } = {};
            
            if (clientsSnapshot.exists()) {
                const data = clientsSnapshot.val();
                Object.keys(data).forEach(key => {
                    clients[key] = { id: key, ...data[key] };
                });
            }

            // Match records to clients by wallet address
            const updates: { [key: string]: any } = {};
            let matched = 0;

            unassignedRecords.forEach(record => {
                // Skip if no wallet address
                if (!record.clientWalletAddress) {
                    return;
                }
                
                const walletAddress = record.clientWalletAddress.toLowerCase();
                
                // Find matching client
                for (const clientId in clients) {
                    const client = clients[clientId];
                    let foundMatch = false;
                    
                    // Check 1: Direct bep20_addresses array
                    if (client.bep20_addresses && Array.isArray(client.bep20_addresses) && client.bep20_addresses.length > 0) {
                        foundMatch = client.bep20_addresses.some(addr => {
                            if (!addr) return false;
                            return addr.toLowerCase() === walletAddress;
                        });
                    }
                    
                    // Check 2: Service Providers - crypto providers with Address details
                    if (!foundMatch && client.serviceProviders && Array.isArray(client.serviceProviders)) {
                        foundMatch = client.serviceProviders.some(provider => {
                            if (provider.providerType !== 'Crypto') return false;
                            const providerAddress = provider.details?.['Address'];
                            if (!providerAddress) return false;
                            return providerAddress.toLowerCase() === walletAddress;
                        });
                    }
                    
                    if (foundMatch) {
                        // Only add if values are defined
                        if (clientId) {
                            updates[`/modern_usdt_records/${record.id}/clientId`] = clientId;
                        }
                        if (client.name) {
                            updates[`/modern_usdt_records/${record.id}/clientName`] = client.name;
                        }
                        // Only count as matched if we have a clientId
                        if (clientId && client.name) {
                            matched++;
                            console.log(`✅ Matched ${record.id} to ${client.name}`);
                        }
                        break;
                    }
                }
            });

            if (Object.keys(updates).length > 0) {
                await update(ref(db), updates);
            }

            toast({
                title: 'Auto-Match Complete',
                description: `Matched ${matched} of ${unassignedRecords.length} unassigned transactions`,
            });
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Button onClick={handleAutoMatch} disabled={isLoading} variant="outline">
            <Link2 className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Matching...' : 'Auto-Match Unassigned'}
        </Button>
    );
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
                        <AutoMatchButton />
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
