
'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import type { FiatRate, CryptoFee } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from './ui/table';
import { format } from 'date-fns';

type FiatHistoryEntry = {
    id: string;
    timestamp: string;
    rates: Record<string, Omit<FiatRate, 'currency'>>;
};

type CryptoHistoryEntry = {
    id: string;
    timestamp: string;
} & CryptoFee;

export function RateHistory() {
    const [fiatHistory, setFiatHistory] = React.useState<FiatHistoryEntry[]>([]);
    const [cryptoHistory, setCryptoHistory] = React.useState<CryptoHistoryEntry[]>([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fiatHistoryRef = query(ref(db, 'rate_history/fiat_rates'), orderByChild('timestamp'), limitToLast(50));
        const cryptoHistoryRef = query(ref(db, 'rate_history/crypto_fees'), orderByChild('timestamp'), limitToLast(50));

        const unsubFiat = onValue(fiatHistoryRef, (snapshot) => {
            const data = snapshot.val();
            const list: FiatHistoryEntry[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
            setFiatHistory(list);
            setLoading(false);
        });

        const unsubCrypto = onValue(cryptoHistoryRef, (snapshot) => {
            const data = snapshot.val();
            const list: CryptoHistoryEntry[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()) : [];
            setCryptoHistory(list);
        });

        return () => {
            unsubFiat();
            unsubCrypto();
        };
    }, []);
    
    const getFiatRateCell = (rates: Record<string, Omit<FiatRate, 'currency'>>, currencyCode: string) => {
        const rate = rates[currencyCode];
        if (!rate) return <TableCell className="text-muted-foreground text-center">N/A</TableCell>;
        return (
            <TableCell>
                <div className="grid grid-cols-2 text-xs">
                    <span className="text-muted-foreground">Client Buy:</span> <span>{rate.clientBuy}</span>
                    <span className="text-muted-foreground">Client Sell:</span> <span>{rate.clientSell}</span>
                    <span className="text-muted-foreground">System Buy:</span> <span>{rate.systemBuy}</span>
                    <span className="text-muted-foreground">System Sell:</span> <span>{rate.systemSell}</span>
                </div>
            </TableCell>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Rate & Fee Change History</CardTitle>
                <CardDescription>A log of the last 50 changes made to rates and fees.</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="fiat">
                    <TabsList>
                        <TabsTrigger value="fiat">Fiat Rate History</TabsTrigger>
                        <TabsTrigger value="crypto">Crypto Fee History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="fiat">
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Timestamp</TableHead>
                                        <TableHead>YER Rates</TableHead>
                                        <TableHead>SAR Rates</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={3} className="h-24 text-center">Loading history...</TableCell></TableRow>
                                    ) : fiatHistory.length > 0 ? (
                                        fiatHistory.map(entry => (
                                            <TableRow key={entry.id}>
                                                <TableCell className="font-medium">{format(new Date(entry.timestamp), 'Pp')}</TableCell>
                                                {getFiatRateCell(entry.rates, 'YER')}
                                                {getFiatRateCell(entry.rates, 'SAR')}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={3} className="h-24 text-center">No fiat rate history found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                    <TabsContent value="crypto">
                         <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Timestamp</TableHead>
                                        <TableHead>Buy Fee (%)</TableHead>
                                        <TableHead>Min. Buy Fee</TableHead>
                                        <TableHead>Sell Fee (%)</TableHead>
                                        <TableHead>Min. Sell Fee</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                     {loading ? (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading history...</TableCell></TableRow>
                                    ) : cryptoHistory.length > 0 ? (
                                        cryptoHistory.map(entry => (
                                            <TableRow key={entry.id}>
                                                <TableCell className="font-medium">{format(new Date(entry.timestamp), 'Pp')}</TableCell>
                                                <TableCell>{entry.buy_fee_percent}</TableCell>
                                                <TableCell>{entry.minimum_buy_fee} USD</TableCell>
                                                <TableCell>{entry.sell_fee_percent}</TableCell>
                                                <TableCell>{entry.minimum_sell_fee} USD</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={5} className="h-24 text-center">No crypto fee history found.</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
