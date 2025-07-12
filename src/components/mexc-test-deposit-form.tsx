
'use client';

import * as React from 'react';
import { useActionState, useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { createMexcTestDeposit, type MexcTestDepositState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { BankAccount } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Test Deposit...</>
            ) : (
                <><Save className="mr-2 h-4 w-4" />Create Test Deposit</>
            )}
        </Button>
    );
}

export function MexcTestDepositForm({ bankAccounts }: { bankAccounts: BankAccount[] }) {
    const { toast } = useToast();
    const [state, formAction] = useActionState<MexcTestDepositState, FormData>(createMexcTestDeposit, undefined);

    React.useEffect(() => {
        if (state?.message && state.error) {
            // Toast is good for success, but Alert is better for persistent form errors.
        }
    }, [state, toast]);

    return (
        <form action={formAction}>
            <Card>
                <CardHeader>
                    <CardTitle>Test Deposit Details</CardTitle>
                    <CardDescription>Fill out the details to create a deposit ready for review.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {state?.error && (
                         <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{state.message}</AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="clientId">Client ID</Label>
                        <Input 
                            id="clientId"
                            name="clientId"
                            required
                            placeholder="Enter the client's ID"
                        />
                        {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="bankAccountId">Bank Account (Source)</Label>
                            <Select name="bankAccountId" required>
                                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="amount">Amount Received</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g. 50000" />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="clientWalletAddress">Client Wallet Address (BEP20)</Label>
                        <Input 
                            id="clientWalletAddress" 
                            name="clientWalletAddress" 
                            required 
                            placeholder="0x..."
                        />
                        {state?.errors?.clientWalletAddress && <p className="text-sm text-destructive">{state.errors.clientWalletAddress[0]}</p>}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
