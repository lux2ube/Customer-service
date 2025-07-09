
'use client';

import * as React from 'react';
import { useActionState, useFormStatus } from 'react-dom';
import { notFound, useParams } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { MexcPendingDeposit } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Check, Loader2 } from 'lucide-react';
import { executeMexcDeposit, type MexcDepositState } from '@/lib/actions';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Executing...</> : <><Check className="mr-2 h-4 w-4" />Confirm & Execute</>}
        </Button>
    );
}


export default function ReviewMexcDepositPage() {
    const params = useParams();
    const id = params.id as string;
    const { toast } = useToast();
    
    const [deposit, setDeposit] = React.useState<MexcPendingDeposit | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [finalUsdtAmount, setFinalUsdtAmount] = React.useState<string>('');

    const [state, formAction] = useActionState<MexcDepositState, FormData>(executeMexcDeposit, undefined);

    React.useEffect(() => {
        if (!id) return;
        const depositRef = ref(db, `mexc_pending_deposits/${id}`);
        const unsubscribe = onValue(depositRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setDeposit({ id, ...data });
                setFinalUsdtAmount(data.calculatedUsdtAmount?.toString() || '');
            } else {
                setDeposit(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [id]);
    
    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Execution Failed' : 'Success',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
        }
    }, [state, toast]);


    if (loading) {
        return <Skeleton className="h-96 w-full" />
    }

    if (!deposit) {
        notFound();
    }
    
    if (deposit.status !== 'pending-review') {
        return (
             <>
                <PageHeader title="Deposit Already Processed" />
                <Card>
                    <CardContent className="pt-6">
                        <p>This deposit has already been {deposit.status}.</p>
                    </CardContent>
                </Card>
            </>
        )
    }

    return (
         <>
            <PageHeader
                title="Review MEXC Deposit"
                description={`Review the details for this automated deposit before executing.`}
            />
             <form action={formAction}>
                 <input type="hidden" name="depositId" value={deposit.id} />
                <Card>
                    <CardHeader>
                        <CardTitle>Deposit Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-1">
                            <Label>Client</Label>
                            <p className="font-medium">{deposit.clientName}</p>
                        </div>
                         <div className="space-y-1">
                            <Label>Client Wallet Address (BEP20)</Label>
                            <p className="font-mono text-sm">{deposit.clientWalletAddress}</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Source Bank Account</Label>
                            <p>{deposit.smsBankAccountName}</p>
                        </div>
                        <div className="space-y-1">
                            <Label>Amount Received from Client</Label>
                            <p className="font-mono">{deposit.smsAmount} {deposit.smsCurrency}</p>
                        </div>
                         <div className="space-y-1">
                            <Label>System Calculated USDT</Label>
                            <p className="font-mono">{deposit.calculatedUsdtAmount} USDT</p>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="finalUsdtAmount" className="font-semibold">Final USDT Amount to Send</Label>
                            <Input 
                                id="finalUsdtAmount"
                                name="finalUsdtAmount"
                                type="number"
                                step="any"
                                value={finalUsdtAmount}
                                onChange={(e) => setFinalUsdtAmount(e.target.value)}
                                required
                            />
                             {state?.errors?.finalUsdtAmount && <p className="text-sm text-destructive">{state.errors.finalUsdtAmount[0]}</p>}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <SubmitButton />
                    </CardFooter>
                </Card>
             </form>
        </>
    );
}
