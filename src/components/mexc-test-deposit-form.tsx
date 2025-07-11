
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { createMexcTestDeposit, type MexcTestDepositState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Account } from '@/lib/types';
import { Loader2, Save } from 'lucide-react';

export function MexcTestDepositForm({ bankAccounts }: { bankAccounts: Account[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [errors, setErrors] = React.useState<MexcTestDepositState['errors']>(undefined);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsLoading(true);
        setErrors(undefined);

        const formData = new FormData(event.currentTarget);
        const result = await createMexcTestDeposit(undefined, formData);

        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
            setErrors(result.errors);
        }

        setIsLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} ref={formRef}>
            <Card>
                <CardHeader>
                    <CardTitle>Test Deposit Details</CardTitle>
                    <CardDescription>Fill out the details to create a deposit ready for review.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="clientId">Client ID</Label>
                        <Input 
                            id="clientId"
                            name="clientId"
                            required
                            placeholder="Enter the client's ID"
                        />
                        {errors?.clientId && <p className="text-sm text-destructive">{errors.clientId[0]}</p>}
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bankAccountId">Bank Account (Source)</Label>
                            <Select name="bankAccountId" required>
                                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {errors?.bankAccountId && <p className="text-sm text-destructive">{errors.bankAccountId[0]}</p>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount Received</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g. 50000" />
                            {errors?.amount && <p className="text-sm text-destructive">{errors.amount[0]}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clientWalletAddress">Client Wallet Address (BEP20)</Label>
                        <Input 
                            id="clientWalletAddress" 
                            name="clientWalletAddress" 
                            required 
                            placeholder="0x..."
                        />
                        {errors?.clientWalletAddress && <p className="text-sm text-destructive">{errors.clientWalletAddress[0]}</p>}
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating Test Deposit...</>
                        ) : (
                            <><Save className="mr-2 h-4 w-4" />Create Test Deposit</>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </form>
    );
}
