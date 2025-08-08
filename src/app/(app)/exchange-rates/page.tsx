
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
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import type { FiatRate, CryptoFee } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, History } from 'lucide-react';
import { updateFiatRates, updateCryptoFees, type RateFormState } from '@/lib/actions';
import { format } from 'date-fns';

function SubmitButton({ children, disabled }: { children: React.ReactNode, disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? 'Saving...' : children}
        </Button>
    );
}

function FiatRateFields({ currency, rate }: { currency: string, rate?: FiatRate }) {
    return (
        <div className="space-y-3 p-3 border rounded-md bg-muted/50">
            <h4 className="font-semibold">{currency} to USD</h4>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                 <div className="space-y-1">
                    <Label>System Buy</Label>
                    <Input name={`${currency}_systemBuy`} type="number" step="any" defaultValue={rate?.systemBuy || ''} required />
                </div>
                <div className="space-y-1">
                    <Label>System Sell</Label>
                    <Input name={`${currency}_systemSell`} type="number" step="any" defaultValue={rate?.systemSell || ''} required />
                </div>
                <div className="space-y-1">
                    <Label>Client Buy</Label>
                    <Input name={`${currency}_clientBuy`} type="number" step="any" defaultValue={rate?.clientBuy || ''} required />
                </div>
                <div className="space-y-1">
                    <Label>Client Sell</Label>
                    <Input name={`${currency}_clientSell`} type="number" step="any" defaultValue={rate?.clientSell || ''} required />
                </div>
            </div>
        </div>
    )
}

function FiatRatesForm({ initialRates }: { initialRates: FiatRate[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateFiatRates, undefined);
    
    React.useEffect(() => {
        if (state?.success) {
            toast({ title: "Fiat Rates Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);

    const yerRate = initialRates.find(r => r.currency === 'YER');
    const sarRate = initialRates.find(r => r.currency === 'SAR');

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Global Fiat Exchange Rates</CardTitle>
                    <CardDescription>Define buy/sell rates for Fiat currencies against USD for both system and client sides.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <FiatRateFields currency="YER" rate={yerRate} />
                    <FiatRateFields currency="SAR" rate={sarRate} />
                </CardContent>
                <CardFooter>
                    <SubmitButton><Save className="mr-2 h-4 w-4"/>Save Fiat Rates</SubmitButton>
                </CardFooter>
            </Card>
        </form>
    );
}

function CryptoFeesForm({ initialFees }: { initialFees?: CryptoFee }) {
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
                    <CardTitle>Global USDT Transaction Fees</CardTitle>
                    <CardDescription>Configure percentage-based fees and minimums for USDT transactions.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="buy_fee_percent">Buy Fee (%)</Label>
                            <Input id="buy_fee_percent" name="buy_fee_percent" type="number" step="any" defaultValue={initialFees?.buy_fee_percent || ''} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="sell_fee_percent">Sell Fee (%)</Label>
                            <Input id="sell_fee_percent" name="sell_fee_percent" type="number" step="any" defaultValue={initialFees?.sell_fee_percent || ''} />
                        </div>
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="minimum_buy_fee">Min. Buy Fee (USD)</Label>
                            <Input id="minimum_buy_fee" name="minimum_buy_fee" type="number" step="any" defaultValue={initialFees?.minimum_buy_fee || ''} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="minimum_sell_fee">Min. Sell Fee (USD)</Label>
                            <Input id="minimum_sell_fee" name="minimum_sell_fee" type="number" step="any" defaultValue={initialFees?.minimum_sell_fee || ''} />
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

export default function ExchangeRatesPage() {
    const [fiatRates, setFiatRates] = React.useState<FiatRate[]>([]);
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | undefined>(undefined);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const fiatRatesRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
        const cryptoFeesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));

        const unsubFiat = onValue(fiatRatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                const lastEntry = data[lastEntryKey];
                setFiatRates(lastEntry.rates || []);
            } else {
                setFiatRates([]);
            }
            setLoading(false);
        });

        const unsubCrypto = onValue(cryptoFeesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                setCryptoFees(data[lastEntryKey]);
            } else {
                setCryptoFees(undefined);
            }
        });

        return () => {
            unsubFiat();
            unsubCrypto();
        };
    }, []);

    if (loading) {
        return (
            <>
                <PageHeader 
                    title="Exchange Rates & Fees"
                    description="Manage global currencies, exchange rates, and transaction fees."
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
                description="Manage global currencies, exchange rates, and transaction fees. Every change is logged with a timestamp."
            />
            <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <FiatRatesForm initialRates={fiatRates} />
                </div>
                <div className="space-y-6">
                     <CryptoFeesForm initialFees={cryptoFees} />
                </div>
            </div>
        </>
    );
}
