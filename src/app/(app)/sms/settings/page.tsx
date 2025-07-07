'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { BankAccount } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';

export default function SmsSettingsPage() {
    const [bankAccounts, setBankAccounts] = React.useState<BankAccount[]>([]);
    const [loading, setLoading] = React.useState(true);
    const { toast } = useToast();
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    React.useEffect(() => {
        const accountsRef = ref(db, 'bank_accounts/');
        const unsubscribe = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: BankAccount[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                list.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.name.localeCompare(b.name));
                setBankAccounts(list);
            } else {
                setBankAccounts([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "URL Copied",
            description: "The endpoint URL has been copied to your clipboard.",
        });
    };

    if (!databaseURL) {
        return (
            <>
                <PageHeader
                    title="SMS Gateway Settings"
                    description="Configure your SMS gateway to post messages to these endpoints."
                />
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">Configuration Error</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p>The `NEXT_PUBLIC_FIREBASE_DATABASE_URL` environment variable is not set. Please configure it to generate the endpoint URLs.</p>
                    </CardContent>
                </Card>
            </>
        );
    }
    
    const sanitizedDbUrl = databaseURL.endsWith('/') ? databaseURL.slice(0, -1) : databaseURL;

    return (
        <>
            <PageHeader
                title="SMS Gateway Settings"
                description="Configure your SMS gateway to post messages to these unique endpoints for each bank account."
            />
            <div className="space-y-4">
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-6 w-1/2" />
                                <Skeleton className="h-4 w-1/4" />
                            </CardHeader>
                            <CardContent>
                                <Skeleton className="h-10 w-full" />
                            </CardContent>
                        </Card>
                    ))
                ) : bankAccounts.length > 0 ? (
                    bankAccounts.map(account => {
                        const endpointUrl = `${sanitizedDbUrl}/incoming/${account.id}.json`;
                        return (
                            <Card key={account.id}>
                                <CardHeader>
                                    <CardTitle>{account.name}</CardTitle>
                                    <CardDescription>Default Currency: {account.currency}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center space-x-2">
                                        <Input value={endpointUrl} readOnly />
                                        <Button variant="outline" size="icon" onClick={() => handleCopy(endpointUrl)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                                <CardFooter>
                                    <p className="text-xs text-muted-foreground">
                                        Use this URL as the endpoint for your SMS gateway to send messages related to this account.
                                    </p>
                                </CardFooter>
                            </Card>
                        );
                    })
                ) : (
                     <Card>
                        <CardContent className="p-6">
                            <p className="text-center text-muted-foreground">No bank accounts found. Please add a bank account first.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}
