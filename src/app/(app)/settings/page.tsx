
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import type { Settings, Account, TransactionFlag } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, Trash2, PlusCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const initialSettings: Settings = {
    yer_usd: 0.0016,
    sar_usd: 0.2666,
    usdt_usd: 1.00,
    deposit_fee_percent: 2,
    withdraw_fee_percent: 1.5,
    minimum_fee_usd: 1,
    bsc_api_key: '',
    bsc_wallet_address: '',
    gemini_api_key: '',
    mexc_api_key: '',
    mexc_secret_key: '',
    mexc_usdt_wallet_account_id: '',
    mexc_min_deposit_usdt: 10,
    mexc_max_deposit_usdt: 1000,
    telegram_bot_token: '',
    transaction_flags: [],
};

const flagColors = [
    { name: 'Gray', value: 'bg-gray-500' },
    { name: 'Red', value: 'bg-red-500' },
    { name: 'Orange', value: 'bg-orange-500' },
    { name: 'Amber', value: 'bg-amber-500' },
    { name: 'Yellow', value: 'bg-yellow-500' },
    { name: 'Lime', value: 'bg-lime-500' },
    { name: 'Green', value: 'bg-green-500' },
    { name: 'Emerald', value: 'bg-emerald-500' },
    { name: 'Teal', value: 'bg-teal-500' },
    { name: 'Cyan', value: 'bg-cyan-500' },
    { name: 'Sky', value: 'bg-sky-500' },
    { name: 'Blue', value: 'bg-blue-500' },
    { name: 'Indigo', value: 'bg-indigo-500' },
    { name: 'Violet', value: 'bg-violet-500' },
    { name: 'Purple', value: 'bg-purple-500' },
    { name: 'Fuchsia', value: 'bg-fuchsia-500' },
    { name: 'Pink', value: 'bg-pink-500' },
    { name: 'Rose', value: 'bg-rose-500' },
];

export default function SettingsPage() {
    const [settings, setSettings] = React.useState<Settings>(initialSettings);
    const [usdtWallets, setUsdtWallets] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const { toast } = useToast();

    // State for the new flag form
    const [newFlagName, setNewFlagName] = React.useState('');
    const [newFlagColor, setNewFlagColor] = React.useState(flagColors[0].value);

    React.useEffect(() => {
        const settingsRef = ref(db, 'settings');
        const accountsRef = ref(db, 'accounts');
        
        const unsubscribeSettings = onValue(settingsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setSettings(prev => ({...prev, ...data}));
            } else {
                update(ref(db), { 'settings': initialSettings });
            }
            setLoading(false);
        });

        const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const allAccounts: Account[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                setUsdtWallets(allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
            }
        });


        return () => {
            unsubscribeSettings();
            unsubscribeAccounts();
        }
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value, type } = e.target;
        setSettings(prev => ({ ...prev, [id]: type === 'number' ? Number(value) : value }));
    };

    const handleSelectChange = (id: string, value: string) => {
        setSettings(prev => ({ ...prev, [id]: value }));
    }

    const handleAddFlag = () => {
        if (!newFlagName.trim()) {
            toast({ variant: 'destructive', title: 'Error', description: 'Flag name cannot be empty.' });
            return;
        }

        const newFlag: TransactionFlag = {
            id: newFlagName.trim().toLowerCase().replace(/\s+/g, '-'),
            name: newFlagName.trim(),
            color: newFlagColor,
        };
        
        const currentFlags = settings.transaction_flags || [];

        if (currentFlags.some(flag => flag.id === newFlag.id)) {
            toast({ variant: 'destructive', title: 'Error', description: 'A flag with this name already exists.' });
            return;
        }

        setSettings(prev => ({
            ...prev,
            transaction_flags: [...currentFlags, newFlag],
        }));
        
        setNewFlagName('');
        setNewFlagColor(flagColors[0].value);
    };

    const handleDeleteFlag = (flagId: string) => {
        setSettings(prev => ({
            ...prev,
            transaction_flags: (prev.transaction_flags || []).filter(flag => flag.id !== flagId),
        }));
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
                        <CardTitle>Transaction & Client Flags</CardTitle>
                        <CardDescription>Create and manage custom labels for transactions and clients.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-4 p-4 border rounded-lg">
                            <h4 className="font-medium">Create New Flag</h4>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="newFlagName">Flag Name</Label>
                                    <Input id="newFlagName" value={newFlagName} onChange={(e) => setNewFlagName(e.target.value)} placeholder="e.g., High Risk" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Flag Color</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {flagColors.map(color => (
                                            <button key={color.value} type="button" onClick={() => setNewFlagColor(color.value)} className={cn('h-6 w-6 rounded-full border', color.value, newFlagColor === color.value && 'ring-2 ring-ring ring-offset-2')}>
                                                <span className="sr-only">{color.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <Button size="sm" type="button" onClick={handleAddFlag}><PlusCircle className="mr-2 h-4 w-4" /> Add Flag</Button>
                        </div>
                        <div className="space-y-2">
                            <h4 className="font-medium">Existing Flags</h4>
                            <div className="flex flex-wrap gap-2">
                                {(settings.transaction_flags || []).length > 0 ? (
                                    settings.transaction_flags?.map(flag => (
                                        <div key={flag.id} className="flex items-center gap-2 rounded-full border py-1 pl-3 pr-1 text-sm">
                                            <span className={cn('h-3 w-3 rounded-full', flag.color)} />
                                            <span>{flag.name}</span>
                                            <button type="button" onClick={() => handleDeleteFlag(flag.id)} className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center">
                                                <Trash2 className="h-3 w-3 text-destructive" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground">No custom flags created yet.</p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>API Integrations</CardTitle>
                        <CardDescription>Manage API keys for external services.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="space-y-2">
                            <Label htmlFor="telegram_bot_token">Telegram Bot Token</Label>
                            <Input id="telegram_bot_token" type="password" placeholder="Your Telegram Bot Token" value={settings.telegram_bot_token || ''} onChange={handleInputChange} />
                             <p className="text-xs text-muted-foreground">
                                Required for client interaction via Telegram.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="gemini_api_key">Gemini API Key</Label>
                            <Input id="gemini_api_key" type="password" placeholder="Your Google AI Gemini API Key" value={settings.gemini_api_key || ''} onChange={handleInputChange} />
                             <p className="text-xs text-muted-foreground">
                                Required for AI-powered SMS parsing.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bsc_api_key">BscScan API Key</Label>
                            <Input id="bsc_api_key" type="password" placeholder="Your BscScan API Key" value={settings.bsc_api_key || ''} onChange={handleInputChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bsc_wallet_address">USDT Wallet Address (BSC)</Label>
                            <Input id="bsc_wallet_address" type="text" placeholder="0x..." value={settings.bsc_wallet_address || ''} onChange={handleInputChange} />
                        </div>
                    </CardContent>
                </Card>

                 <Card>
                    <CardHeader>
                        <CardTitle>MEXC Automation</CardTitle>
                        <CardDescription>Configure API keys and settings for automated deposits via MEXC.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="mexc_api_key">MEXC API Key</Label>
                                <Input id="mexc_api_key" type="password" placeholder="Your MEXC API Key" value={settings.mexc_api_key || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mexc_secret_key">MEXC Secret Key</Label>
                                <Input id="mexc_secret_key" type="password" placeholder="Your MEXC Secret Key" value={settings.mexc_secret_key || ''} onChange={handleInputChange} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mexc_usdt_wallet_account_id">MEXC Source Wallet</Label>
                             <Select onValueChange={(v) => handleSelectChange('mexc_usdt_wallet_account_id', v)} value={settings.mexc_usdt_wallet_account_id}>
                                <SelectTrigger><SelectValue placeholder="Select your MEXC USDT wallet..." /></SelectTrigger>
                                <SelectContent>
                                    {usdtWallets.map(wallet => (
                                        <SelectItem key={wallet.id} value={wallet.id}>
                                            {wallet.name} ({wallet.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">This is the wallet in your Chart of Accounts that represents your MEXC funds.</p>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                             <div className="space-y-2">
                                <Label htmlFor="mexc_min_deposit_usdt">Min. Auto-Deposit (USDT)</Label>
                                <Input id="mexc_min_deposit_usdt" type="number" value={settings.mexc_min_deposit_usdt || ''} onChange={handleInputChange} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mexc_max_deposit_usdt">Max. Auto-Deposit (USDT)</Label>
                                <Input id="mexc_max_deposit_usdt" type="number" value={settings.mexc_max_deposit_usdt || ''} onChange={handleInputChange} />
                            </div>
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
