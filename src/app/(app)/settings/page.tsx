
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
import type { Settings, FiatRate, CryptoFee } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, PlusCircle, Trash2 } from 'lucide-react';
import { updateFiatRates, updateCryptoFees, updateApiSettings, type RateFormState } from '@/lib/actions';

function SubmitButton({ children, disabled }: { children: React.ReactNode, disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? 'Saving...' : children}
        </Button>
    );
}

function FiatRatesForm({ initialRates }: { initialRates: FiatRate[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateFiatRates, undefined);
    const [rates, setRates] = React.useState<FiatRate[]>(initialRates);

    React.useEffect(() => {
        if (state?.success) {
            toast({ title: "Fiat Rates Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);

    const handleAddRate = () => {
        setRates([...rates, { currency: '', systemBuy: 0, systemSell: 0, clientBuy: 0, clientSell: 0 }]);
    };

    const handleRemoveRate = (index: number) => {
        setRates(rates.filter((_, i) => i !== index));
    };

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Fiat Exchange Rates</CardTitle>
                    <CardDescription>Define buy/sell rates for Fiat currencies against USD for both system and client sides.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {rates.map((rate, index) => (
                        <div key={index} className="space-y-3 p-3 border rounded-md relative bg-muted/50">
                            <div className="grid grid-cols-5 gap-2">
                                <div className="space-y-1 col-span-5">
                                    <Label>Currency Code</Label>
                                    <Input name={`currency_${index}`} placeholder="e.g., YER" defaultValue={rate.currency} required />
                                </div>
                                <div className="space-y-1">
                                    <Label>System Buy</Label>
                                    <Input name={`systemBuy_${index}`} type="number" step="any" defaultValue={rate.systemBuy} required />
                                </div>
                                <div className="space-y-1">
                                    <Label>System Sell</Label>
                                    <Input name={`systemSell_${index}`} type="number" step="any" defaultValue={rate.systemSell} required />
                                </div>
                                <div className="space-y-1">
                                    <Label>Client Buy</Label>
                                    <Input name={`clientBuy_${index}`} type="number" step="any" defaultValue={rate.clientBuy} required />
                                </div>
                                <div className="space-y-1">
                                    <Label>Client Sell</Label>
                                    <Input name={`clientSell_${index}`} type="number" step="any" defaultValue={rate.clientSell} required />
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1" onClick={() => handleRemoveRate(index)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={handleAddRate}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Fiat Currency
                    </Button>
                </CardContent>
                <CardFooter>
                    <SubmitButton><Save className="mr-2 h-4 w-4"/>Save Fiat Rates</SubmitButton>
                </CardFooter>
            </Card>
        </form>
    );
}

function CryptoFeesForm({ initialFees }: { initialFees: CryptoFee }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateCryptoFees, undefined);
    
     React.useEffect(() => {
        if (state?.success) {
            toast({ title: "Crypto Fees Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Crypto Transaction Fees</CardTitle>
                    <CardDescription>Configure percentage-based fees and minimums for USDT transactions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="buy_fee_percent">Buy Fee (%)</Label>
                            <Input id="buy_fee_percent" name="buy_fee_percent" type="number" step="any" defaultValue={initialFees?.buy_fee_percent || 0} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="sell_fee_percent">Sell Fee (%)</Label>
                            <Input id="sell_fee_percent" name="sell_fee_percent" type="number" step="any" defaultValue={initialFees?.sell_fee_percent || 0} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="minimum_buy_fee">Min. Buy Fee (USD)</Label>
                            <Input id="minimum_buy_fee" name="minimum_buy_fee" type="number" step="any" defaultValue={initialFees?.minimum_buy_fee || 0} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="minimum_sell_fee">Min. Sell Fee (USD)</Label>
                            <Input id="minimum_sell_fee" name="minimum_sell_fee" type="number" step="any" defaultValue={initialFees?.minimum_sell_fee || 0} />
                        </div>
                    </div>
                </CardContent>
                 <CardFooter>
                    <SubmitButton><Save className="mr-2 h-4 w-4"/>Save Crypto Fees</SubmitButton>
                </CardFooter>
            </Card>
        </form>
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
    const [fiatRates, setFiatRates] = React.useState<FiatRate[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee>({ buy_fee_percent: 0, sell_fee_percent: 0, minimum_buy_fee: 0, minimum_sell_fee: 0 });
    const [apiSettings, setApiSettings] = React.useState<Settings>({} as Settings);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const fiatRatesRef = ref(db, 'settings/fiat_rates');
        const cryptoFeesRef = ref(db, 'settings/crypto_fees');
        const apiSettingsRef = ref(db, 'settings/api');

        const unsubFiat = onValue(fiatRatesRef, (snapshot) => {
            setFiatRates(snapshot.val() ? Object.values(snapshot.val()) : []);
            setLoading(false);
        });
        const unsubCrypto = onValue(cryptoFeesRef, (snapshot) => {
            setCryptoFees(snapshot.val() || { buy_fee_percent: 0, sell_fee_percent: 0, minimum_buy_fee: 0, minimum_sell_fee: 0 });
        });
         const unsubApi = onValue(apiSettingsRef, (snapshot) => {
            setApiSettings(snapshot.val() || {});
        });

        return () => {
            unsubFiat();
            unsubCrypto();
            unsubApi();
        };
    }, []);

    if (loading) {
        return (
            <>
                <PageHeader 
                    title="Exchange Rates & Fees"
                    description="Manage exchange rates, fees, and API keys."
                />
                <div className="space-y-6">
                   <Skeleton className="h-64 w-full" />
                   <Skeleton className="h-64 w-full" />
                </div>
            </>
        );
    }

    return (
        <>
            <PageHeader 
                title="Exchange Rates & Fees"
                description="Manage currencies, exchange rates, transaction fees, and API keys for system integrations."
            />
            <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <FiatRatesForm initialRates={fiatRates} />
                </div>
                <div className="space-y-6">
                    <CryptoFeesForm initialFees={cryptoFees} />
                    <ApiSettingsForm initialSettings={apiSettings} />
                </div>
            </div>
        </>
    );
}
