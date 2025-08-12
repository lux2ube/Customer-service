
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast, get } from 'firebase/database';
import type { FiatRate, CryptoFee, Currency, Settings } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Save, PlusCircle, Database, Trash2, Repeat } from 'lucide-react';
import { updateFiatRates, updateCryptoFees, initializeDefaultCurrencies, addCurrency, deleteCurrency, type RateFormState, type CurrencyFormState } from '@/lib/actions';
import { RateHistory } from '@/components/rate-history';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogHeader, 
    AlertDialogTitle, 
    AlertDialogFooter 
} from '@/components/ui/alert-dialog';


function SubmitButton({ children, disabled }: { children: React.ReactNode, disabled?: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending || disabled}>
            {pending ? 'Saving...' : children}
        </Button>
    );
}

function AddCurrencyDialog() {
    const { toast } = useToast();
    const [open, setOpen] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);
    const [state, formAction] = useActionState<CurrencyFormState, FormData>(addCurrency, undefined);

    React.useEffect(() => {
        if(state?.message) {
            toast({ title: state.error ? 'Error' : 'Success', description: state.message, variant: state.error ? 'destructive' : 'default' });
            if (!state.error) {
                setOpen(false);
                formRef.current?.reset();
            }
        }
    }, [state, toast]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4"/>Add New Currency</Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add New Currency</DialogTitle>
                    <DialogDescription>Define a new currency for use throughout the system.</DialogDescription>
                </DialogHeader>
                <form action={formAction} ref={formRef} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="code">Code</Label>
                        <Input id="code" name="code" placeholder="e.g., USD" required />
                         {state?.errors?.code && <p className="text-sm text-destructive">{state.errors.code[0]}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" name="name" placeholder="e.g., US Dollar" required />
                        {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label>Type</Label>
                        <RadioGroup name="type" defaultValue="fiat" className="flex gap-4">
                            <div className="flex items-center space-x-2"><RadioGroupItem value="fiat" id="fiat"/><Label htmlFor="fiat" className="font-normal">Fiat</Label></div>
                            <div className="flex items-center space-x-2"><RadioGroupItem value="crypto" id="crypto"/><Label htmlFor="crypto" className="font-normal">Crypto</Label></div>
                        </RadioGroup>
                         {state?.errors?.type && <p className="text-sm text-destructive">{state.errors.type[0]}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="decimals">Decimal Places</Label>
                        <Input id="decimals" name="decimals" type="number" placeholder="e.g., 2" defaultValue={2} required />
                        {state?.errors?.decimals && <p className="text-sm text-destructive">{state.errors.decimals[0]}</p>}
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                        <SubmitButton><Save className="mr-2 h-4 w-4"/>Add Currency</SubmitButton>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function CurrencyManager({ currencies }: { currencies: Currency[] }) {
    const { toast } = useToast();
    const [itemToDelete, setItemToDelete] = React.useState<Currency | null>(null);

    const [initState, initFormAction] = useActionState<RateFormState, FormData>(initializeDefaultCurrencies, undefined);
    
    React.useEffect(() => {
        if(initState?.message) {
            toast({ title: initState.error ? 'Error' : 'Success', description: initState.message, variant: initState.error ? 'destructive' : 'default' });
        }
    }, [initState, toast]);

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const result = await deleteCurrency(itemToDelete.code);
        toast({ title: result.error ? 'Error' : 'Success', description: result.message, variant: result.error ? 'destructive' : 'default' });
        setItemToDelete(null);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>System Currencies</CardTitle>
                <CardDescription>Manage all fiat and crypto currencies used in the application.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Decimals</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {currencies.length > 0 ? (
                            currencies.map(c => (
                                <TableRow key={c.code}>
                                    <TableCell className="font-semibold">{c.code}</TableCell>
                                    <TableCell>{c.name}</TableCell>
                                    <TableCell className="capitalize">{c.type}</TableCell>
                                    <TableCell>{c.decimals}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => setItemToDelete(c)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow><TableCell colSpan={5} className="h-24 text-center">No currencies configured.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
                <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will permanently delete the currency "{itemToDelete?.name} ({itemToDelete?.code})". This action cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete}>Continue</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </CardContent>
            <CardFooter className="justify-between">
                <form action={initFormAction}>
                     <Button variant="secondary" type="submit">
                        <Database className="mr-2 h-4 w-4"/>
                        Initialize Default Currencies
                    </Button>
                </form>
                <AddCurrencyDialog />
            </CardFooter>
        </Card>
    )
}

function FiatRatesForm({ initialRates, currencies }: { initialRates: Record<string, FiatRate>, currencies: Currency[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateFiatRates, undefined);
    
    React.useEffect(() => {
        if (state?.success) {
            toast({ title: "Fiat Rates Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);
    
    const fiatCurrencies = currencies.filter(c => c.type === 'fiat' && !['USD', 'USDT'].includes(c.code));

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Global Fiat Exchange Rates vs USD</CardTitle>
                    <CardDescription>Define buy/sell rates for Fiat currencies against the base currency (USD). New sections appear automatically when you add a new fiat currency.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {fiatCurrencies.length > 0 ? fiatCurrencies.map(currency => {
                        const currentRate = initialRates[currency.code] || {};
                        return (
                            <div key={currency.code} className="space-y-3 p-3 border rounded-md bg-muted/50">
                                <h4 className="font-semibold">{currency.name} ({currency.code}) to USD</h4>
                                <div className="grid grid-cols-2 gap-4">
                                     <div className="space-y-2 border-r pr-4">
                                        <h5 className="text-sm font-medium">Client Side</h5>
                                         <div className="space-y-1">
                                            <Label className="text-xs">Buy Rate (Client Buys {currency.code})</Label>
                                            <Input name={`${currency.code}_clientBuy`} type="number" step="any" defaultValue={currentRate?.clientBuy || ''} required />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Sell Rate (Client Sells {currency.code})</Label>
                                            <Input name={`${currency.code}_clientSell`} type="number" step="any" defaultValue={currentRate?.clientSell || ''} required />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                         <h5 className="text-sm font-medium">System Side (for Commission)</h5>
                                         <div className="space-y-1">
                                            <Label className="text-xs">Buy Rate (System Buys {currency.code})</Label>
                                            <Input name={`${currency.code}_systemBuy`} type="number" step="any" defaultValue={currentRate?.systemBuy || ''} required />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Sell Rate (System Sells {currency.code})</Label>
                                            <Input name={`${currency.code}_systemSell`} type="number" step="any" defaultValue={currentRate?.systemSell || ''} required />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    }) : (
                        <p className="text-sm text-muted-foreground text-center p-4">No non-USD fiat currencies configured. Add one in the "System Currencies" section.</p>
                    )}
                </CardContent>
                <CardFooter>
                    <SubmitButton disabled={fiatCurrencies.length === 0}><Save className="mr-2 h-4 w-4"/>Save Fiat Rates</SubmitButton>
                </CardFooter>
            </Card>
        </form>
    );
}

function CryptoRatesForm({ initialRates, currencies }: { initialRates: Record<string, number>, currencies: Currency[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<RateFormState, FormData>(updateFiatRates, undefined);
    
    React.useEffect(() => {
        if (state?.success) {
            toast({ title: "Crypto Rates Saved", description: state.message });
        } else if (state?.message) {
            toast({ variant: 'destructive', title: "Error", description: state.message });
        }
    }, [state, toast]);
    
    const cryptoCurrencies = currencies.filter(c => c.type === 'crypto');

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Crypto Exchange Rates vs USD</CardTitle>
                    <CardDescription>Define the value of each crypto asset relative to 1 USD.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {cryptoCurrencies.length > 0 ? cryptoCurrencies.map(currency => {
                        const currentRate = initialRates[currency.code] || 1;
                        return (
                            <div key={currency.code} className="flex items-center gap-4">
                                <Label className="w-24">1 {currency.code} =</Label>
                                <Input 
                                    name={currency.code} 
                                    type="number" 
                                    step="any" 
                                    defaultValue={currentRate} 
                                    required 
                                    className="max-w-xs"
                                />
                                <Label>USD</Label>
                            </div>
                        )
                    }) : (
                        <p className="text-sm text-muted-foreground text-center p-4">No crypto currencies configured.</p>
                    )}
                </CardContent>
                <CardFooter>
                    <SubmitButton disabled={cryptoCurrencies.length === 0}><Save className="mr-2 h-4 w-4"/>Save Crypto Rates</SubmitButton>
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
    const [fiatRates, setFiatRates] = React.useState<Record<string, FiatRate>>({});
    const [cryptoRates, setCryptoRates] = React.useState<Record<string, number>>({});
    const [cryptoFees, setCryptoFees] = React.useState<CryptoFee | undefined>(undefined);
    const [currencies, setCurrencies] = React.useState<Currency[]>([]);
    const [loading, setLoading] = React.useState(true);
    
    React.useEffect(() => {
        const fiatRatesRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(1));
        const cryptoRatesRef = query(ref(db, 'rate_history/crypto_rates'), orderByChild('timestamp'), limitToLast(1));
        const cryptoFeesRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(1));
        const currenciesRef = ref(db, 'settings/currencies');

        const unsubFiat = onValue(fiatRatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                const lastEntry = data[lastEntryKey];
                setFiatRates(lastEntry.rates || {});
            } else {
                setFiatRates({});
            }
        });

        const unsubCryptoRates = onValue(cryptoRatesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const lastEntryKey = Object.keys(data)[0];
                setCryptoRates(data[lastEntryKey].rates || {});
            }
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

        const unsubCurrencies = onValue(currenciesRef, (snapshot) => {
            setCurrencies(snapshot.exists() ? Object.values(snapshot.val()) : []);
        });

        Promise.all([
            get(fiatRatesRef),
            get(cryptoRatesRef),
            get(cryptoFeesRef),
            get(currenciesRef)
        ]).then(() => setLoading(false))
        .catch(err => {
            console.error("Failed to load initial data:", err);
            setLoading(false);
        });

        return () => {
            unsubFiat();
            unsubCryptoRates();
            unsubCrypto();
            unsubCurrencies();
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
                    <CurrencyManager currencies={currencies} />
                    <CryptoRatesForm initialRates={cryptoRates} currencies={currencies} />
                    <CryptoFeesForm initialFees={cryptoFees} />
                </div>
                <div className="space-y-6">
                    <FiatRatesForm initialRates={fiatRates} currencies={currencies} />
                     <RateHistory />
                </div>
            </div>
        </>
    );
}
