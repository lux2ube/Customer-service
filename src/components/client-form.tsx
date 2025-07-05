
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
import type { Client, ReviewFlag, KycDocument, Account } from '@/lib/types';
import { Separator } from './ui/separator';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const reviewFlags: ReviewFlag[] = ['AML', 'Volume', 'Scam', 'Blacklisted', 'Other'];

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Client</>}
        </Button>
    );
}

export function ClientForm({ client, bankAccounts }: { client?: Client, bankAccounts?: Account[] }) {
    const { toast } = useToast();
    
    const action = client ? manageClient.bind(null, client.id) : createClient.bind(null, null);
    const [state, formAction] = useActionState<ClientFormState, FormData>(action, undefined);

    const [formData, setFormData] = React.useState({
        name: client?.name || '',
        phone: client?.phone || '',
        verification_status: client?.verification_status || 'Pending',
        review_flags: client?.review_flags || [],
        favoriteBankAccountId: client?.favoriteBankAccountId || 'none',
    });

    React.useEffect(() => {
        if (client) {
            setFormData({
                name: client.name || '',
                phone: client.phone || '',
                verification_status: client.verification_status || 'Pending',
                review_flags: client.review_flags || [],
                favoriteBankAccountId: client.favoriteBankAccountId || 'none',
            });
        }
    }, [client]);
    
    React.useEffect(() => {
        if (state?.message) {
             toast({ variant: 'destructive', title: 'Error', description: state.message });
        }
        if (state?.success) {
            toast({ title: 'Success', description: state.message });
        }
    }, [state, toast]);

    const handleFlagChange = (flag: ReviewFlag, checked: boolean) => {
        setFormData(prev => {
            const newFlags = checked 
                ? [...prev.review_flags, flag]
                : prev.review_flags.filter(f => f !== flag);
            return { ...prev, review_flags: newFlags };
        });
    };

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
                            <Input 
                                id="name" 
                                name="name" 
                                placeholder="e.g., John M. Doe" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                required 
                            />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input 
                                id="phone" 
                                name="phone" 
                                placeholder="e.g., 555-1234" 
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                required 
                            />
                            {state?.errors?.phone && <p className="text-sm text-destructive">{state.errors.phone[0]}</p>}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <Label>Verification Status</Label>
                             <RadioGroup 
                                name="verification_status" 
                                value={formData.verification_status}
                                onValueChange={(value) => setFormData({...formData, verification_status: value as Client['verification_status']})}
                                className="flex items-center gap-4 pt-2"
                            >
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
                        <div className="space-y-2">
                            <Label htmlFor="favoriteBankAccountId">Favorite Bank Account</Label>
                            <Select 
                                name="favoriteBankAccountId" 
                                value={formData.favoriteBankAccountId}
                                onValueChange={(value) => setFormData({...formData, favoriteBankAccountId: value})}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a favorite account..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {bankAccounts?.map(account => (
                                        <SelectItem key={account.id} value={account.id}>
                                            {account.name} ({account.currency})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">This is automatically set by the last confirmed transaction.</p>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>Review Flags</Label>
                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            {reviewFlags.map(flag => (
                            <div key={flag} className="flex items-center space-x-2">
                                <Checkbox 
                                    id={`flag-${flag}`} 
                                    name="review_flags" 
                                    value={flag} 
                                    checked={formData.review_flags?.includes(flag)}
                                    onCheckedChange={(checked) => handleFlagChange(flag, !!checked)}
                                />
                                <Label htmlFor={`flag-${flag}`} className="font-normal">{flag}</Label>
                            </div>
                            ))}
                        </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <h3 className="text-lg font-medium">BEP20 Addresses</h3>
                        <p className="text-sm text-muted-foreground">
                            Addresses are automatically added from confirmed deposit transactions.
                        </p>
                        {client?.bep20_addresses && client.bep20_addresses.length > 0 ? (
                            <ul className="divide-y divide-border rounded-md border bg-background">
                                {client.bep20_addresses.map((address, index) => (
                                    <li key={index} className="flex items-center justify-between p-3">
                                        <span className="font-mono text-sm break-all">{address}</span>
                                        <Button
                                            type="submit"
                                            name="intent"
                                            value={`delete_address:${address}`}
                                            variant="ghost"
                                            size="icon"
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground p-3 border rounded-md">No BEP20 addresses recorded for this client.</p>
                        )}
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
