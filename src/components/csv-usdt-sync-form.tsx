'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { syncBscCsv } from '@/lib/actions';
import type { SyncState } from '@/lib/actions/integration';
import type { BscApiSetting } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

function CsvUploadButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            <Upload className={`mr-2 h-4 w-4 ${pending ? 'animate-spin' : ''}`} />
            {pending ? 'Syncing CSV...' : 'Upload & Sync CSV'}
        </Button>
    );
}

export function CsvUsdtSyncForm() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<SyncState, FormData>(syncBscCsv, undefined);
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
                title: state.error ? 'CSV Sync Failed' : 'CSV Sync Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);

    if (apiSettings.length === 0) {
        return (
            <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" />
                No API Configured
            </Button>
        );
    }

    return (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
            <Select value={selectedApi} onValueChange={setSelectedApi}>
                <SelectTrigger className="w-full md:w-[250px]">
                    <SelectValue placeholder="Select API configuration..." />
                </SelectTrigger>
                <SelectContent>
                    {apiSettings.map(api => (
                        <SelectItem key={api.id} value={api.id}>{api.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <input type="hidden" name="apiId" value={selectedApi} />

            <Input
                type="file"
                name="csvFile"
                accept=".csv"
                className="w-full md:w-[200px]"
            />

            <CsvUploadButton />
        </form>
    );
}
