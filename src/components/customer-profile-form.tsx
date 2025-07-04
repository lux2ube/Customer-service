'use client';

import { Customer, Label } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label as UiLabel } from './ui/label';
import { Textarea } from './ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { X, UploadCloud } from 'lucide-react';
import React from 'react';

interface CustomerProfileFormProps {
  customer: Customer;
  allLabels: Label[];
}

export function CustomerProfileForm({ customer, allLabels }: CustomerProfileFormProps) {
    const [currentLabels, setCurrentLabels] = React.useState<string[]>(customer.labels);
    const [fileName, setFileName] = React.useState<string | null>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            setFileName(event.target.files[0].name);
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

  return (
    <div className="space-y-6">
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
                        <Button variant="outline" onClick={() => document.getElementById('avatar')?.click()}>Change Avatar</Button>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="name">Full Name</UiLabel>
                            <Input id="name" defaultValue={customer.name} />
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="email">Email</UiLabel>
                            <Input id="email" type="email" defaultValue={customer.email} />
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <UiLabel htmlFor="phone">Phone</UiLabel>
                            <Input id="phone" type="tel" defaultValue={customer.phone} />
                        </div>
                        <div className="space-y-2">
                            <UiLabel htmlFor="address">Address</UiLabel>
                            <Input id="address" defaultValue={customer.address} />
                        </div>
                    </div>
                     <div className="space-y-2">
                        <UiLabel htmlFor="notes">Notes</UiLabel>
                        <Textarea id="notes" defaultValue={customer.notes} rows={4} />
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
                                <button onClick={() => toggleLabel(labelId)} className="rounded-full hover:bg-black/10 p-0.5">
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        )) : <p className="text-sm text-muted-foreground">No labels assigned.</p>}
                    </div>

                    <UiLabel>Available Labels</UiLabel>
                    <div className="flex flex-wrap gap-2">
                        {availableLabelsToAdd.map(label => (
                            <button key={label.id} onClick={() => toggleLabel(label.id)}>
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
                <div className="space-y-2">
                    <UiLabel htmlFor="kyc-upload" className="cursor-pointer">
                        <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg hover:bg-secondary transition-colors">
                            <UploadCloud className="w-8 h-8 text-muted-foreground" />
                            <p className="mt-2 text-sm text-muted-foreground">
                                {fileName ? `Selected: ${fileName}` : 'Click to upload or drag and drop'}
                            </p>
                            <p className="text-xs text-muted-foreground">PDF, PNG, JPG up to 10MB</p>
                        </div>
                    </UiLabel>
                    <Input id="kyc-upload" type="file" className="hidden" onChange={handleFileChange} />
                </div>
            </CardContent>
        </Card>
    </div>
  );
}
