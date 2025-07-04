'use client';

import { Lead } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label as UiLabel } from './ui/label';
import { Button } from './ui/button';
import { Save } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveLead, type FormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface LeadProfileFormProps {
  lead: Lead;
  isCreating?: boolean;
}

function SubmitButton({ isCreating }: { isCreating: boolean }) {
    const { pending } = useFormStatus();

    return (
        <Button type="submit" disabled={pending}>
            {pending ? (
                <>{isCreating ? 'Creating...' : 'Saving...'}</>
            ) : (
                <>
                    <Save className="mr-2 h-4 w-4" />
                    {isCreating ? 'Create Lead' : 'Save Changes'}
                </>
            )}
        </Button>
    )
}

export function LeadProfileForm({ lead, isCreating = false }: LeadProfileFormProps) {
    const { toast } = useToast();
    
    const saveLeadWithId = saveLead.bind(null, lead.id);
    const [state, formAction] = useFormState<FormState, FormData>(saveLeadWithId, undefined);

    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({
                variant: 'destructive',
                title: 'Error Saving Lead',
                description: state.message,
            });
        }
    }, [state, toast]);

  return (
    <form action={formAction} className="space-y-6">
        
        <Card>
            <CardHeader>
                <CardTitle>Lead Profile</CardTitle>
                <CardDescription>Basic lead information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <UiLabel htmlFor="name">Full Name</UiLabel>
                        <Input id="name" name="name" defaultValue={lead.name} aria-describedby="name-error" />
                        {state?.errors?.name && <p id="name-error" className="text-sm text-destructive">{state.errors.name[0]}</p>}
                    </div>
                    <div className="space-y-2">
                        <UiLabel htmlFor="email">Email</UiLabel>
                        <Input id="email" name="email" type="email" defaultValue={lead.email} aria-describedby="email-error" />
                         {state?.errors?.email && <p id="email-error" className="text-sm text-destructive">{state.errors.email[0]}</p>}
                    </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <UiLabel htmlFor="phone">Phone</UiLabel>
                        <Input id="phone" name="phone" type="tel" defaultValue={lead.phone} />
                    </div>
                    <div className="space-y-2">
                        <UiLabel htmlFor="source">Source</UiLabel>
                        <Input id="source" name="source" defaultValue={lead.source} aria-describedby="source-error" placeholder="e.g. Website, Referral" />
                        {state?.errors?.source && <p id="source-error" className="text-sm text-destructive">{state.errors.source[0]}</p>}
                    </div>
                </div>
                 <div className="space-y-2">
                    <UiLabel htmlFor="status">Status</UiLabel>
                    <Select name="status" defaultValue={lead.status}>
                        <SelectTrigger id="status" aria-describedby="status-error">
                            <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="New">New</SelectItem>
                            <SelectItem value="Contacted">Contacted</SelectItem>
                            <SelectItem value="Qualified">Qualified</SelectItem>
                            <SelectItem value="Unqualified">Unqualified</SelectItem>
                        </SelectContent>
                    </Select>
                    {state?.errors?.status && <p id="status-error" className="text-sm text-destructive">{state.errors.status[0]}</p>}
                </div>
            </CardContent>
        </Card>
        
        <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm py-4 -mx-6 px-6">
           <SubmitButton isCreating={isCreating} />
        </div>
    </form>
  );
}
