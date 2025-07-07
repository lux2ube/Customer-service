
'use client';

import * as React from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Settings, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Account } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Label } from '@/components/ui/label';

export default function SmsGatewaySetupPage() {
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);
    const { toast } = useToast();
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    React.useEffect(() => {
        const accountsRef = ref(db, 'accounts/');
        const unsubscribe = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: Account[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                }));
                const filteredList = list.filter(acc => !acc.isGroup && acc.currency);
                filteredList.sort((a, b) => a.id.localeCompare(b.id));
                setAccounts(filteredList);
            } else {
                setAccounts([]);
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
                    title="SMS Gateway Setup"
                    description="Configure your SMS gateway to post messages for AI-powered parsing."
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
                title="SMS Gateway Setup"
                description="Configure your SMS gateway to post messages for AI-powered parsing."
            />
            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex-row items-center gap-4 space-y-0">
                        <div className="p-3 bg-primary/10 rounded-full">
                           <Bot className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle>AI-Powered SMS Parsing</CardTitle>
                            <CardDescription>
                                This system now uses a powerful AI model to parse incoming SMS messages. 
                                Please ensure your Gemini API key is set correctly.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                         <p className="text-sm text-muted-foreground">
                            The AI parser is designed to be flexible and understand various SMS formats automatically. 
                            For it to work, you must add your Google AI Gemini API key in the main application settings.
                            The key must also be available as a <code className="font-mono bg-muted p-1 rounded-md">GEMINI_API_KEY</code> environment variable in your hosting backend.
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button asChild variant="outline">
                            <Link href="/settings">
                                <Settings className="mr-2 h-4 w-4" />
                                Go to Settings
                            </Link>
                        </Button>
                    </CardFooter>
                </Card>

                <h2 className="text-xl font-semibold tracking-tight">Account Endpoints</h2>
                 <p className="text-sm text-muted-foreground">
                    Configure your SMS gateway to `POST` the raw SMS body as a JSON payload to these unique URLs. Each URL corresponds to a specific account in your Chart of Accounts.
                </p>

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
                ) : accounts.length > 0 ? (
                    accounts.map(account => {
                        const endpointUrl = `${sanitizedDbUrl}/incoming/${account.id}.json`;
                        return (
                            <Card key={account.id}>
                                <CardHeader>
                                    <CardTitle>{account.name} ({account.id})</CardTitle>
                                    <CardDescription>Default Currency: {account.currency}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Label htmlFor={`endpoint-${account.id}`}>POST URL</Label>
                                    <div className="flex items-center space-x-2">
                                        <Input id={`endpoint-${account.id}`} value={endpointUrl} readOnly />
                                        <Button variant="outline" size="icon" onClick={() => handleCopy(endpointUrl)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                ) : (
                     <Card>
                        <CardContent className="p-6">
                            <p className="text-center text-muted-foreground">No transaction accounts with a currency assigned were found in your Chart of Accounts. Please add one first.</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}
