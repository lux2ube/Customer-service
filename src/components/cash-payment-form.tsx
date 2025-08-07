
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import type { Client, Account, CashPayment } from '@/lib/types';
import { cn } from '@/lib/utils';
import { createCashPayment, type CashPaymentFormState } from '@/lib/actions';
import { useRouter } from 'next/navigation';

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                </>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    {isEditing ? 'Save Changes' : 'Record Payment'}
                </>
            )}
        </Button>
    );
}

function ClientSelector({ clients, selectedClientId, onSelect, disabled }: { clients: Client[], selectedClientId: string, onSelect: (clientId: string) => void, disabled?: boolean }) {
    const [open, setOpen] = React.useState(false);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={disabled}>
                    {selectedClientId ? clients.find(c => c.id === selectedClientId)?.name : "Select a client..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandInput placeholder="Search clients..." />
                    <CommandList>
                        <CommandEmpty>No client found.</CommandEmpty>
                        <CommandGroup>
                            {clients.map(client => (
                                <CommandItem
                                    key={client.id}
                                    value={client.name}
                                    onSelect={() => {
                                        onSelect(client.id);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn("mr-2 h-4 w-4", selectedClientId === client.id ? "opacity-100" : "opacity-0")} />
                                    {client.name}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function CashPaymentForm({ clients, bankAccounts, payment }: { clients: Client[], bankAccounts: Account[], payment?: CashPayment }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);
    const actionWithId = createCashPayment.bind(null, payment?.id || null);
    const [state, formAction] = useActionState<CashPaymentFormState, FormData>(actionWithId, undefined);
    
    const [selectedClientId, setSelectedClientId] = React.useState(payment?.clientId || '');
    const [selectedBankAccountId, setSelectedBankAccountId] = React.useState(payment?.bankAccountId || '');
    
    React.useEffect(() => {
        if (state?.success) {
            toast({
                title: 'Success',
                description: state.message,
            });
            if (payment?.id) {
                router.push('/cash-payments');
            } else {
                formRef.current?.reset();
                setSelectedClientId('');
                setSelectedBankAccountId('');
            }
        } else if (state?.message) {
            toast({
                title: 'Error',
                description: state.message,
                variant: 'destructive',
            });
        }
    }, [state, toast, payment, router]);

    const isEditing = !!payment;

    return (
        <form action={formAction} ref={formRef}>
             <Card>
                <CardHeader>
                    <CardTitle>{isEditing ? 'Edit' : 'New'} Cash Payment</CardTitle>
                    <CardDescription>Fill in the details of the cash payment.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bankAccountId">Paid From (Bank Account)</Label>
                            <Select name="bankAccountId" required value={selectedBankAccountId} onValueChange={setSelectedBankAccountId} disabled={isEditing}>
                                <SelectTrigger><SelectValue placeholder="Select bank account..." /></SelectTrigger>
                                <SelectContent>
                                    {bankAccounts.map(account => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.name} ({account.currency})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {state?.errors?.bankAccountId && <p className="text-sm text-destructive">{state.errors.bankAccountId[0]}</p>}
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="amount">Amount Paid</Label>
                            <Input id="amount" name="amount" type="number" step="any" required placeholder="e.g., 10000" defaultValue={payment?.amount} disabled={isEditing} />
                            {state?.errors?.amount && <p className="text-sm text-destructive">{state.errors.amount[0]}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="clientId">Debit from Client Account</Label>
                         <ClientSelector clients={clients} selectedClientId={selectedClientId} onSelect={setSelectedClientId} disabled={isEditing} />
                        <input type="hidden" name="clientId" value={selectedClientId} />
                         {state?.errors?.clientId && <p className="text-sm text-destructive">{state.errors.clientId[0]}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="recipientName">Recipient Name (if not a client)</Label>
                        <Input id="recipientName" name="recipientName" placeholder="e.g., John Doe" defaultValue={payment?.recipientName} />
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="remittanceNumber">Remittance Number</Label>
                            <Input id="remittanceNumber" name="remittanceNumber" placeholder="Optional" defaultValue={payment?.remittanceNumber} />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="note">Note</Label>
                            <Textarea id="note" name="note" placeholder="Optional notes about the transaction" defaultValue={payment?.note} />
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex justify-end">
                    <SubmitButton isEditing={isEditing} />
                </CardFooter>
            </Card>
        </form>
    );
}
