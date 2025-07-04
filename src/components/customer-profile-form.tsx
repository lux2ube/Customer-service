'use client';

import { Customer, Label } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label as UiLabel } from './ui/label';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { X, UploadCloud, Save } from 'lucide-react';
import React from 'react';
import { useFormState } from 'react-dom';
import { saveCustomer } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

interface CustomerProfileFormProps {
  customer: Customer;
  allLabels: Label[];
  isCreating?: boolean;
}

export function CustomerProfileForm({ customer, allLabels, isCreating = false }: CustomerProfileFormProps) {
    const [currentLabels, setCurrentLabels] = React.useState<string[]>(customer.labels);
    const [kycFilePreview, setKycFilePreview] = React.useState<string | null>(null);
    const { toast } = useToast();

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
                description: `${file.name} is ready. In a real app, this would be uploaded upon saving.`,
            });
        }
    };
    
    const labelMap = React.useMemo(() => {
        return allLabels.reduce((acc, label) => {
          acc[label.id] = label;
          return acc;
        }, {} as Record<string, Label>);
      }, [allLabels]);

    const toggleLabel = (labelId: string) => {
        setCurrentLabels(prev => 
            prev.includes(labelId) ? prev.filter(id => id !== labelId) : [...prev, labelId]
        );
    };
    
    const availableLabelsToAdd = allLabels.filter(l => !currentLabels.includes(l.id));

    const [state, formAction] = useFormState(saveCustomer, { message: '' });

    React.useEffect(() => {
        if (state.message) {
             const isSuccess = state.message.includes('successfully');
             toast({
                variant: isSuccess ? 'default' : 'destructive',
                title: isSuccess ? 'Success!' : 'Error',
                description: state.message,
            });
        }
    }, [state, toast]);

  return (
    <form action={formAction} className="space-y-6">
        {!isCreating && <input type="hidden" name="id" value={customer.id} />}
        {currentLabels.map(labelId => (
          <input type="hidden" name="labels" key={labelId} value={labelId} />
        ))}
        
        <Card>
            <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Basic customer information.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={customer.avatarUrl} />
                            <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <Input type="file" id="avatar" className="hidden" />
                        <Button type="button" variant="outline" onClick={() => document.getElementById('avatar')?.click()}>Change Avatar</Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="name">Full Name</UiLabel>
                            <Input id="name" name="name" defaultValue={customer.name} />
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="email">Email</UiLabel>
                            <Input id="email" name="email" type="email" defaultValue={customer.email} />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="phone">Phone</UiLabel>
                            <Input id="phone" name="phone" type="tel" defaultValue={customer.phone} />
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="address">Address</UiLabel>
                            <Input id="address" name="address" defaultValue={customer.address} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <UiLabel htmlFor="notes">Notes</UiLabel>
                        <Textarea id="notes" name="notes" defaultValue={customer.notes} rows={4} />
                    </div>
                </div>
            </CardContent>
        </Card>

        <Card>
            <CardHeader>
                <CardTitle>Labels</CardTitle>
                <CardDescription>Categorize this customer with labels.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <UiLabel>Current Labels</UiLabel>
                    <div className="flex flex-wrap gap-2">
                        {currentLabels.length > 0 ? currentLabels.map(labelId => (
                            <Badge key={labelId} variant="secondary" className="text-sm py-1 px-3 flex items-center gap-2" style={{ backgroundColor: labelMap[labelId]?.color, color: '#000' }}>
                                {labelMap[labelId]?.name}
                                <button type="button" onClick={() => toggleLabel(labelId)} className="rounded-full hover:bg-black/10 p-0.5">
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )) : <p className="text-sm text-muted-foreground">No labels assigned.</p>}
                    </div>

                    <UiLabel>Available Labels</UiLabel>
                    <div className="flex flex-wrap gap-2">
                        {availableLabelsToAdd.map(label => (
                            <button type="button" key={label.id} onClick={() => toggleLabel(label.id)}>
                                <Badge variant="outline" className="text-sm py-1 px-3 hover:bg-secondary cursor-pointer">
                                    + {label.name}
                                </Badge>
                            </button>
                        ))}
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
            <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                {isCreating ? 'Create Customer' : 'Save Changes'}
            </Button>
        </div>
    </form>
  );
}
