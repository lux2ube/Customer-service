
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save } from 'lucide-react';
import { updateApiSettings, type RateFormState } from '@/lib/actions';

function SubmitButton({ children, disabled }: { children: React.ReactNode, disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? 'Saving...' : children}
        </Button>
    );
}

function ApiSettingsForm({ initialSettings }: { initialSettings: Settings }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateApiSettings, undefined);
    
     React.useEffect(() => {
        if (state?.success) {
            toast({ title: "API Settings Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>API Integrations</CardTitle>
                    <CardDescription>Manage API keys for external services.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="gemini_api_key">Gemini API Key</Label>
                        <Input id="gemini_api_key" name="gemini_api_key" type="password" placeholder="Your Google AI Gemini API Key" defaultValue={initialSettings?.gemini_api_key || ''} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bsc_api_key">BscScan API Key</Label>
                        <Input id="bsc_api_key" name="bsc_api_key" type="password" placeholder="Your BscScan API Key" defaultValue={initialSettings?.bsc_api_key || ''} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="bsc_wallet_address">USDT Wallet Address (BSC)</Label>
                        <Input id="bsc_wallet_address" name="bsc_wallet_address" type="text" placeholder="0x..." defaultValue={initialSettings?.bsc_wallet_address || ''} />
                    </div>
                </CardContent>
                <CardFooter>
                    <SubmitButton><Save className="mr-2 h-4 w-4"/>Save API Settings</SubmitButton>
                </CardFooter>
            </Card>
        </form>
    )
}

export default function SettingsPage() {
    const [apiSettings, setApiSettings] = React.useState<Settings>({} as Settings);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const apiSettingsRef = ref(db, 'settings/api');

        const unsubApi = onValue(apiSettingsRef, (snapshot) => {
            setApiSettings(snapshot.val() || {});
            setLoading(false);
        });

        return () => {
            unsubApi();
        };
    }, []);

    if (loading) {
        return (
            <>
                <PageHeader 
                    title="Settings"
                    description="Manage system-wide settings and API keys for integrations."
                />
                <div className="space-y-6">
                   <Skeleton className="h-64 w-full max-w-lg" />
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader 
                title="Settings"
                description="Manage system-wide settings and API keys for integrations."
            />
            <div className="max-w-lg">
                <ApiSettingsForm initialSettings={apiSettings} />
            </div>
        </>
    );
}
