'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { createBankAccount, type BankAccountFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import type { BankAccount } from '@/lib/types';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Account</>}
        </Button>
    );
}

export function BankAccountForm({ account }: { account?: BankAccount }) {
    const { toast } = useToast();
    
    const action = account ? createBankAccount.bind(null, account.id) : createBankAccount.bind(null, null);
    const [state, formAction] = useFormState<BankAccountFormState, FormData>(action, undefined);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error Saving Account', description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{account ? 'Edit' : 'New'} Bank Account</CardTitle>
                    <CardDescription>Fill in the details for the bank account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Account Name</Label>
                            <Input id="name" name="name" placeholder="e.g., Al-Amal Bank" defaultValue={account?.name} required />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account_number">Account Number</Label>
                            <Input id="account_number" name="account_number" placeholder="e.g., 123456789" defaultValue={account?.account_number} />
                             {state?.errors?.account_number && <p className="text-sm text-destructive">{state.errors.account_number[0]}</p>}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <Select name="currency" defaultValue={account?.currency || 'USD'} required>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="YER">YER</SelectItem>
                                    <SelectItem value="SAR">SAR</SelectItem>
                                </SelectContent>
                            </Select>
                            {state?.errors?.currency && <p className="text-sm text-destructive">{state.errors.currency[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <RadioGroup name="status" defaultValue={account?.status || 'Active'} className="flex items-center gap-4 pt-2">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Active" id="status-active" />
                                    <Label htmlFor="status-active" className="font-normal">Active</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Inactive" id="status-inactive" />
                                    <Label htmlFor="status-inactive" className="font-normal">Inactive</Label>
                                </div>
                            </RadioGroup>
                             {state?.errors?.status && <p className="text-sm text-destructive">{state.errors.status[0]}</p>}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton />
                </CardFooter>
            </Card>
        </form>
    );
}
