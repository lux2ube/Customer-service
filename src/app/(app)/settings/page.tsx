
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
import { updateApiSettings, rebuildBalancesAction, type RateFormState, type RebuildBalanceState } from '@/lib/actions';
import { RefreshCw } from 'lucide-react';

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
                </CardContent>
                <CardFooter>
                    <SubmitButton><Save className="mr-2 h-4 w-4"/>Save API Settings</SubmitButton>
                </CardFooter>
            </Card>
        </form>
    )
}

function RebuildSubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button 
            type="submit"
            disabled={pending}
            variant="outline"
        >
            {pending ? (
                <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin"/>
                    Rebuilding...
                </>
            ) : (
                <>
                    <RefreshCw className="mr-2 h-4 w-4"/>
                    Rebuild All Balances
                </>
            )}
        </Button>
    );
}

function BalanceManagementCard() {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RebuildBalanceState, FormData>(rebuildBalancesAction, undefined);
    
    React.useEffect(() => {
        if (state?.success) {
            toast({ 
                title: "Balances Rebuilt", 
                description: state.message 
            });
        } else if (state?.success === false) {
            toast({ 
                variant: 'destructive', 
                title: "Error", 
                description: state.message 
            });
        }
    }, [state, toast]);
    
    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Balance Management</CardTitle>
                    <CardDescription>
                        Recalculate all account balances from journal entries. Use this to fix any balance discrepancies.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                        This will recalculate balances for all accounts based on journal entries. 
                        Use this if account balances appear incorrect or after importing data.
                    </p>
                </CardContent>
                <CardFooter>
                    <RebuildSubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
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
            <div className="max-w-lg space-y-6">
                <ApiSettingsForm initialSettings={apiSettings} />
                <BalanceManagementCard />
            </div>
        </>
    );
}
