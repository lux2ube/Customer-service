
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import type { Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save } from 'lucide-react';

const initialSettings: Settings = {
    yer_usd: 0.0016,
    sar_usd: 0.2666,
    usdt_usd: 1.00,
    deposit_fee_percent: 2,
    withdraw_fee_percent: 1.5,
    minimum_fee_usd: 1,
    bsc_api_key: '',
    bsc_wallet_address: '',
};

export default function SettingsPage() {
    const [settings, setSettings] = React.useState<Settings>(initialSettings);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const { toast } = useToast();

    React.useEffect(() => {
        const settingsRef = ref(db, 'settings');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setSettings(data);
            } else {
                // If no settings in DB, set initial values
                update(ref(db), { 'settings': initialSettings });
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setSettings(prev => ({ ...prev, [id]: type === 'number' ? Number(value) : value }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await update(ref(db, 'settings'), settings);
            toast({
                title: "Settings Saved",
                description: "Your changes have been saved successfully.",
            });
        } catch (error) {
            console.error("Failed to save settings: ", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to save settings. Please try again.",
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <>
                <PageHeader 
                    title="Settings"
                    description="Manage currencies, exchange rates, fees, and other system preferences."
                />
                <div className="space-y-8">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle><Skeleton className="h-7 w-48" /></CardTitle>
                                <CardDescription><Skeleton className="h-4 w-full" /></CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </CardContent>
                        </Card>
                         <Card>
                            <CardHeader>
                                <CardTitle><Skeleton className="h-7 w-48" /></CardTitle>
                                <CardDescription><Skeleton className="h-4 w-full" /></CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </CardContent>
                        </Card>
                    </div>
                     <div className="flex justify-start">
                        <Skeleton className="h-11 w-48" />
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader 
                title="Settings"
                description="Manage currencies, exchange rates, fees, and other system preferences."
            />
            <div className="space-y-8">
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Exchange Rates</CardTitle>
                            <CardDescription>Set the conversion rates relative to USD.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="yer_usd">YER / USD</Label>
                                <Input id="yer_usd" type="number" step="any" value={settings.yer_usd || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sar_usd">SAR / USD</Label>
                                <Input id="sar_usd" type="number" step="any" value={settings.sar_usd || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="usdt_usd">USDT / USD</Label>
                                <Input id="usdt_usd" type="number" value={settings.usdt_usd || ''} disabled />
                            </div>
                        </CardContent>
                    </Card>
                     <Card>
                        <CardHeader>
                            <CardTitle>Transaction Fees</CardTitle>
                            <CardDescription>Configure the fees for deposits and withdrawals.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="deposit_fee_percent">Deposit Fee (%)</Label>
                                <Input id="deposit_fee_percent" type="number" value={settings.deposit_fee_percent || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="withdraw_fee_percent">Withdraw Fee (%)</Label>
                                <Input id="withdraw_fee_percent" type="number" value={settings.withdraw_fee_percent || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="minimum_fee_usd">Minimum Fee (USD)</Label>
                                <Input id="minimum_fee_usd" type="number" value={settings.minimum_fee_usd || ''} onChange={handleInputChange} />
                            </div>
                        </CardContent>
                    </Card>
                </div>
                 <Card>
                    <CardHeader>
                        <CardTitle>API Integrations</CardTitle>
                        <CardDescription>Connect to external services like BscScan.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="bsc_api_key">BscScan API Key</Label>
                            <Input id="bsc_api_key" type="password" placeholder="Your BscScan API Key" value={settings.bsc_api_key || ''} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bsc_wallet_address">USDT Wallet Address</Label>
                            <Input id="bsc_wallet_address" type="text" placeholder="0x..." value={settings.bsc_wallet_address || ''} onChange={handleInputChange} />
                        </div>
                    </CardContent>
                </Card>
                <div className="flex justify-start">
                     <Button onClick={handleSave} disabled={saving}>
                        <Save className="mr-2 h-4 w-4" />
                        {saving ? 'Saving...' : 'Save All Settings'}
                    </Button>
                </div>
            </div>
        </>
    );
}
