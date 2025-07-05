
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createClient, type ClientFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import type { Client, ReviewFlag } from '@/lib/types';

const reviewFlags: ReviewFlag[] = ['AML', 'Volume', 'Scam', 'Other'];

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Client</>}
        </Button>
    );
}

export function ClientForm({ client }: { client?: Client }) {
    const { toast } = useToast();
    
    const action = client ? createClient.bind(null, client.id) : createClient.bind(null, null);
    const [state, formAction] = useActionState<ClientFormState, FormData>(action, undefined);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error Saving Client', description: state.message });
        }
    }, [state, toast]);

    return (
        <form action={formAction} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{client ? 'Edit' : 'New'} Client</CardTitle>
                    <CardDescription>Fill in the details for the client profile.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input id="name" name="name" placeholder="e.g., John M. Doe" defaultValue={client?.name} required />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input id="phone" name="phone" placeholder="e.g., 555-1234" defaultValue={client?.phone} required />
                            {state?.errors?.phone && <p className="text-sm text-destructive">{state.errors.phone[0]}</p>}
                        </div>
                    </div>
                     <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="kyc_type">KYC Type</Label>
                            <Select name="kyc_type" defaultValue={client?.kyc_type}>
                                <SelectTrigger><SelectValue placeholder="Select KYC type..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ID">ID</SelectItem>
                                    <SelectItem value="Passport">Passport</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="kyc_document_url">KYC Document</Label>
                            <Input id="kyc_document_url" name="kyc_document_url" type="file" />
                            {/* In a real app, you'd handle file uploads properly. This is a placeholder. */}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Verification Status</Label>
                             <RadioGroup name="verification_status" defaultValue={client?.verification_status || 'Pending'} className="flex items-center gap-4 pt-2">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Pending" id="status-pending" />
                                    <Label htmlFor="status-pending" className="font-normal">Pending</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Active" id="status-active" />
                                    <Label htmlFor="status-active" className="font-normal">Active</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Inactive" id="status-inactive" />
                                    <Label htmlFor="status-inactive" className="font-normal">Inactive</Label>
                                </div>
                            </RadioGroup>
                             {state?.errors?.verification_status && <p className="text-sm text-destructive">{state.errors.verification_status[0]}</p>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Review Flags</Label>
                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            {reviewFlags.filter(f => f !== 'None').map(flag => (
                            <div key={flag} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={`flag-${flag}`} 
                                    name="review_flags" 
                                    value={flag} 
                                    defaultChecked={client?.review_flags?.includes(flag)}
                                />
                                <Label htmlFor={`flag-${flag}`} className="font-normal">{flag}</Label>
                            </div>
                            ))}
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
