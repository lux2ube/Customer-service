'use client';

import type { Client } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label as UiLabel } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveTransaction, type FormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

interface TransactionFormProps {
  clients: Client[];
}

function SubmitButton() {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>Creating...</>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    Create Transaction
                </>
            )}
        </Button>
    )
}

export function TransactionForm({ clients }: TransactionFormProps) {
    const { toast } = useToast();
    const [state, formAction] = useFormState<FormState, FormData>(saveTransaction, undefined);

    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({
                variant: 'destructive',
                title: 'Error Saving Transaction',
                description: state.message,
            });
        }
    }, [state, toast]);

  return (
    <form action={formAction} className="space-y-6">
        <Card>
            <CardHeader>
                <CardTitle>Transaction Details</CardTitle>
                <CardDescription>Enter the core details of the transaction.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <UiLabel>Transaction Type</UiLabel>
                        <RadioGroup name="type" defaultValue="Deposit" className="flex gap-4">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="Deposit" id="deposit" />
                                <UiLabel htmlFor="deposit">Deposit</UiLabel>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="Withdraw" id="withdraw" />
                                <UiLabel htmlFor="withdraw">Withdraw</UiLabel>
                            </div>
                        </RadioGroup>
                         {state?.errors?.type && <p className="text-sm text-destructive">{state.errors.type[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <UiLabel htmlFor="clientId">Client</UiLabel>
                        <Select name="clientId">
                            <SelectTrigger id="clientId" aria-describedby="client-error">
                                <SelectValue placeholder="Select a client" />
                            </SelectTrigger>
                            <SelectContent>
                                {clients.map(client => (
                                    <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {state?.errors?.clientId && <p id="client-error" className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="amount">Amount</UiLabel>
                            <Input id="amount" name="amount" type="number" step="0.01" placeholder="e.g., 1000.00" aria-describedby="amount-error" />
                            {state?.errors?.amount && <p id="amount-error" className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="status">Status</UiLabel>
                            <Select name="status" defaultValue="Pending">
                                <SelectTrigger id="status" aria-describedby="status-error">
                                    <SelectValue placeholder="Select a status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Confirmed">Confirmed</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                            {state?.errors?.status && <p id="status-error" className="text-sm text-destructive">{state.errors.status[0]}</p>}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
        
        <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm py-4 -mx-6 px-6">
           <SubmitButton />
        </div>
    </form>
  );
}
