'use client';

import { Client } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label as UiLabel } from './ui/label';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { X, UploadCloud, Save } from 'lucide-react';
import React from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveClient, type FormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

interface ClientProfileFormProps {
  client: Client;
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
                    {isCreating ? 'Create Client' : 'Save Changes'}
                </>
            )}
        </Button>
    )
}

export function ClientProfileForm({ client, isCreating = false }: ClientProfileFormProps) {
    const [kycFilePreview, setKycFilePreview] = React.useState<string | null>(null);
    const { toast } = useToast();
    
    const saveClientWithId = saveClient.bind(null, client.id);
    const [state, formAction] = useFormState<FormState, FormData>(saveClientWithId, undefined);


    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setKycFilePreview(reader.result as string);
                };
                reader.readAsDataURL(file);
            } else {
                 setKycFilePreview(null);
            }
            toast({
                title: "File Selected",
                description: `${file.name} is ready for upload. Note: File upload is not implemented in this prototype.`,
            });
        }
    };

    React.useEffect(() => {
        if (state?.message && state.errors) {
             toast({
                variant: 'destructive',
                title: 'Error Saving Client',
                description: state.message,
            });
        }
    }, [state, toast]);

  return (
    <form action={formAction} className="space-y-6">
        
        <Card>
            <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Basic client information.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={client.avatarUrl} />
                            <AvatarFallback>{client.name.charAt(0) || '?'}</AvatarFallback>
                        </Avatar>
                        <Input type="file" id="avatar" className="hidden" />
                        <Button type="button" variant="outline" onClick={() => document.getElementById('avatar')?.click()}>Change Avatar</Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="name">Full Name</UiLabel>
                            <Input id="name" name="name" defaultValue={client.name} aria-describedby="name-error" />
                            {state?.errors?.name && <p id="name-error" className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="email">Email</UiLabel>
                            <Input id="email" name="email" type="email" defaultValue={client.email} aria-describedby="email-error" />
                             {state?.errors?.email && <p id="email-error" className="text-sm text-destructive">{state.errors.email[0]}</p>}
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="phone">Phone</UiLabel>
                            <Input id="phone" name="phone" type="tel" defaultValue={client.phone} />
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="address">Address</UiLabel>
                            <Input id="address" name="address" defaultValue={client.address} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <UiLabel htmlFor="notes">Notes</UiLabel>
                        <Textarea id="notes" name="notes" defaultValue={client.notes} rows={4} />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>KYC Document</CardTitle>
                <CardDescription>Upload ID or Passport for verification.</CardDescription>
            </CardHeader>
            <CardContent>
                {kycFilePreview ? (
                    <div className="relative group">
                        <img src={kycFilePreview} alt="KYC Preview" className="w-full h-auto max-h-60 object-contain rounded-md border bg-muted" />
                        <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => {
                            setKycFilePreview(null);
                            const input = document.getElementById('kyc-upload') as HTMLInputElement;
                            if (input) input.value = '';
                        }}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                ) : (
                <div className="space-y-2">
                    <UiLabel htmlFor="kyc-upload" className="cursor-pointer">
                        <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg hover:bg-secondary transition-colors">
                            <UploadCloud className="w-8 h-8 text-muted-foreground" />
                            <p className="mt-2 text-sm text-muted-foreground">Click to upload or drag and drop</p>
                            <p className="text-xs text-muted-foreground">PDF, PNG, JPG up to 10MB</p>
                        </div>
                    </UiLabel>
                    <Input id="kyc-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, application/pdf"/>
                </div>
                )}
            </CardContent>
        </Card>
        
        <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur-sm py-4 -mx-6 px-6">
           <SubmitButton isCreating={isCreating} />
        </div>
    </form>
  );
}
