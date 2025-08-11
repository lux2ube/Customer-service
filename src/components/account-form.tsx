
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createAccount, type AccountFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import type { Account, Currency } from '@/lib/types';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Account</>}
        </Button>
    );
}

export function AccountForm({ account, parentAccounts, currencies }: { account?: Account, parentAccounts: Account[], currencies: Currency[] }) {
    const { toast } = useToast();
    
    const action = createAccount.bind(null, account?.id || null);
    const [state, formAction] = useActionState<AccountFormState, FormData>(action, undefined);

    const [formData, setFormData] = React.useState({
        id: account?.id || '',
        name: account?.name || '',
        type: account?.type || 'Assets',
        parentId: account?.parentId || 'none',
        currency: account?.currency || 'none',
        isGroup: account?.isGroup || false,
    });

    React.useEffect(() => {
        if (account) {
            setFormData({
                id: account.id || '',
                name: account.name || '',
                type: account.type || 'Assets',
                parentId: account.parentId || 'none',
                currency: account.currency || 'none',
                isGroup: account.isGroup || false,
            });
        }
    }, [account]);
    
    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({ variant: 'destructive', title: 'Error Saving Account', description: state.message });
        }
    }, [state, toast]);

    const handleFieldChange = (field: keyof typeof formData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <form action={formAction} className="space-y-3">
            <Card>
                <CardHeader>
                    <CardTitle>{account ? 'Edit' : 'New'} Account</CardTitle>
                    <CardDescription>
                        {account ? `Editing account: ${account.name} (${account.id})` : 'Create a new account for your chart of accounts.'}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="id">Account Code</Label>
                            <Input 
                                id="id" 
                                name="id" 
                                placeholder="e.g., 101" 
                                value={formData.id}
                                onChange={(e) => handleFieldChange('id', e.target.value)}
                                required 
                                disabled={!!account}
                            />
                             {state?.errors?.id && <p className="text-sm text-destructive">{state.errors.id[0]}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="name">Account Name</Label>
                            <Input 
                                id="name" 
                                name="name" 
                                placeholder="e.g., Cash - USD" 
                                value={formData.name} 
                                onChange={(e) => handleFieldChange('name', e.target.value)}
                                required 
                            />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="type">Account Type</Label>
                            <Select 
                                name="type" 
                                value={formData.type}
                                onValueChange={(value) => handleFieldChange('type', value)}
                                required
                            >
                                <SelectTrigger><SelectValue placeholder="Select a type..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Assets">Assets</SelectItem>
                                    <SelectItem value="Liabilities">Liabilities</SelectItem>
                                    <SelectItem value="Equity">Equity</SelectItem>
                                    <SelectItem value="Income">Income</SelectItem>
                                    <SelectItem value="Expenses">Expenses</SelectItem>
                                </SelectContent>
                            </Select>
                            {state?.errors?.type && <p className="text-sm text-destructive">{state.errors.type[0]}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="parentId">Parent Account (Group)</Label>
                            <Select 
                                name="parentId" 
                                value={formData.parentId || 'none'}
                                onValueChange={(value) => handleFieldChange('parentId', value)}
                            >
                                <SelectTrigger><SelectValue placeholder="Select a parent account..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None (Root Account)</SelectItem>
                                    {parentAccounts.map(parent => (
                                        <SelectItem key={parent.id} value={parent.id}>{parent.name} ({parent.id})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-4 items-end">
                        <div className="space-y-1.5">
                            <Label htmlFor="currency">Currency (for postable accounts)</Label>
                            <Select 
                                name="currency" 
                                value={formData.currency || 'none'}
                                onValueChange={(value) => handleFieldChange('currency', value)}
                                disabled={formData.isGroup}
                            >
                                <SelectTrigger><SelectValue placeholder="Select a currency..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {currencies.map(c => (
                                        <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {state?.errors?.currency && <p className="text-sm text-destructive">{state.errors.currency[0]}</p>}
                        </div>
                         <div className="flex items-center space-x-2 pb-2">
                            <Checkbox 
                                id="isGroup" 
                                name="isGroup" 
                                checked={formData.isGroup} 
                                onCheckedChange={(checked) => handleFieldChange('isGroup', !!checked)}
                            />
                            <div>
                                <Label htmlFor="isGroup" className="font-normal">This is a group account</Label>
                                <p className="text-xs text-muted-foreground">Group accounts cannot have transactions posted to them directly.</p>
                            </div>
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
