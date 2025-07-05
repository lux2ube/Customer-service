
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Trash2 } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { createClient, manageClient, type ClientFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import type { Client, ReviewFlag, KycDocument } from '@/lib/types';
import { Separator } from './ui/separator';
import Link from 'next/link';

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
    
    const action = client ? manageClient.bind(null, client.id) : createClient.bind(null, null);
    const [state, formAction] = useActionState<ClientFormState, FormData>(action, undefined);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error', description: state.message });
        }
        if (state?.success) {
            toast({ title: 'Success', description: state.message });
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

                    <Separator />

                    <div className="space-y-4">
                        <h3 className="text-lg font-medium">KYC Documents</h3>
                        {client?.kyc_documents && client.kyc_documents.length > 0 && (
                            <div className="space-y-2">
                                <Label>Uploaded Documents</Label>
                                <ul className="divide-y divide-border rounded-md border bg-background">
                                    {client.kyc_documents.map((doc) => (
                                        <li key={doc.name} className="flex items-center justify-between p-3">
                                            <Button variant="link" asChild className="p-0 h-auto justify-start">
                                                <Link href={doc.url} target="_blank" rel="noopener noreferrer">
                                                    {doc.name}
                                                </Link>
                                            </Button>
                                            <Button
                                                type="submit"
                                                name="intent"
                                                value={`delete:${doc.name}`}
                                                variant="ghost"
                                                size="icon"
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                         <div className="space-y-2">
                            <Label htmlFor="kyc_files">Upload New Document(s)</Label>
                            <Input id="kyc_files" name="kyc_files" type="file" multiple />
                            <p className="text-sm text-muted-foreground">You can select multiple files at once.</p>
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
