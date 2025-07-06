
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
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
    const [state, formAction] = useActionState<BankAccountFormState, FormData>(action, undefined);

    const [formData, setFormData] = React.useState({
        name: account?.name || '',
        account_number: account?.account_number || '',
        currency: account?.currency || 'USD',
        status: account?.status || 'Active',
    });

    React.useEffect(() => {
        if (account) {
            setFormData({
                name: account.name || '',
                account_number: account.account_number || '',
                currency: account.currency || 'USD',
                status: account.status || 'Active',
            });
        }
    }, [account]);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error Saving Account', description: state.message });
        }
    }, [state, toast]);

    const handleFieldChange = (field: keyof typeof formData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form action={formAction} className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>{account ? 'Edit' : 'New'} Bank Account</CardTitle>
                    <CardDescription>Fill in the details for the bank account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Account Name</Label>
                            <Input 
                                id="name" 
                                name="name" 
                                placeholder="e.g., Al-Amal Bank" 
                                value={formData.name} 
                                onChange={(e) => handleFieldChange('name', e.target.value)}
                                required 
                            />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="account_number">Account Number</Label>
                            <Input 
                                id="account_number" 
                                name="account_number" 
                                placeholder="e.g., 123456789" 
                                value={formData.account_number}
                                onChange={(e) => handleFieldChange('account_number', e.target.value)}
                             />
                             {state?.errors?.account_number && <p className="text-sm text-destructive">{state.errors.account_number[0]}</p>}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label htmlFor="currency">Currency</Label>
                            <Select 
                                name="currency" 
                                value={formData.currency} 
                                onValueChange={(value) => handleFieldChange('currency', value)}
                                required
                            >
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
                            <RadioGroup 
                                name="status" 
                                value={formData.status} 
                                onValueChange={(value) => handleFieldChange('status', value)}
                                className="flex items-center gap-4 pt-2"
                            >
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
