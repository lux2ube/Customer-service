
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useActionState, useFormStatus } from 'react-dom';
import { createAccount, type AccountFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import type { Account } from '@/lib/types';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Account</>}
        </Button>
    );
}

export function AccountForm({ account, parentAccounts }: { account?: Account, parentAccounts: Account[] }) {
    const { toast } = useToast();
    
    // The action needs to handle both create and update. Since the ID is part of the form,
    // we can use the same server action for both.
    const [state, formAction] = useActionState<AccountFormState, FormData>(createAccount, undefined);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error Saving Account', description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{account ? 'Edit' : 'New'} Account</CardTitle>
                    <CardDescription>Fill in the details for the account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                     <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="id">Account Code</Label>
                            <Input id="id" name="id" placeholder="e.g., 101" defaultValue={account?.id} required disabled={!!account}/>
                             {state?.errors?.id && <p className="text-sm text-destructive">{state.errors.id[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name">Account Name</Label>
                            <Input id="name" name="name" placeholder="e.g., Cash - USD" defaultValue={account?.name} required />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="type">Account Type</Label>
                            <Select name="type" defaultValue={account?.type} required>
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
                        <div className="space-y-2">
                            <Label htmlFor="parentId">Parent Account (Group)</Label>
                            <Select name="parentId" defaultValue={account?.parentId || ''}>
                                <SelectTrigger><SelectValue placeholder="Select a parent account..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">None</SelectItem>
                                    {parentAccounts.map(parent => (
                                        <SelectItem key={parent.id} value={parent.id}>{parent.name} ({parent.id})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="currency">Currency (Optional)</Label>
                            <Select name="currency" defaultValue={account?.currency || ''}>
                                <SelectTrigger><SelectValue placeholder="Select a currency..."/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">None</SelectItem>
                                    <SelectItem value="USD">USD</SelectItem>
                                    <SelectItem value="YER">YER</SelectItem>
                                    <SelectItem value="SAR">SAR</SelectItem>
                                    <SelectItem value="USDT">USDT</SelectItem>
                                </SelectContent>
                            </Select>
                            {state?.errors?.currency && <p className="text-sm text-destructive">{state.errors.currency[0]}</p>}
                        </div>
                         <div className="flex items-center space-x-2 pt-8">
                            <Checkbox id="isGroup" name="isGroup" defaultChecked={account?.isGroup} />
                            <Label htmlFor="isGroup" className="font-normal">This is a group account</Label>
                            <p className="text-xs text-muted-foreground">(Cannot post to)</p>
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
