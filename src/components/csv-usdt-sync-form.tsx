'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { syncBscCsv } from '@/lib/actions';
import type { SyncState } from '@/lib/actions/integration';
import type { Account } from '@/lib/types';
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
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [selectedAccount, setSelectedAccount] = React.useState('');
    const [configName, setConfigName] = React.useState('');
    const [fileName, setFileName] = React.useState('');
    const [walletAddress, setWalletAddress] = React.useState('');

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts');
        const unsubscribe = onValue(accountsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list: Account[] = Object.keys(data)
                    .map(key => ({ id: key, ...data[key] } as Account))
                    .filter(acc => acc.currency === 'USDT');
                setAccounts(list);
                if (list.length > 0 && !selectedAccount) {
                    setSelectedAccount(list[0].id);
                }
            } else {
                setAccounts([]);
            }
        });
        return () => unsubscribe();
    }, [selectedAccount]);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'CSV Sync Failed' : 'CSV Sync Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
            if (!state.error) {
                setFileName('');
                setConfigName('');
                setWalletAddress('');
            }
        }
    }, [state, toast]);

    if (accounts.length === 0) {
        return (
            <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" />
                No USDT Account
            </Button>
        );
    }

    return (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                    {accounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <input type="hidden" name="accountId" value={selectedAccount} />

            <Input
                type="text"
                name="configName"
                placeholder="Config name (e.g., Main Wallet)"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                className="w-full md:w-[180px]"
            />

            <Input
                type="text"
                name="walletAddress"
                placeholder="Wallet address (0x...)"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full md:w-[220px]"
            />

            <Input
                type="file"
                name="csvFile"
                accept=".csv"
                onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) setFileName(file.name);
                }}
                className="w-full md:w-[200px]"
            />

            <CsvUploadButton />
        </form>
    );
}
