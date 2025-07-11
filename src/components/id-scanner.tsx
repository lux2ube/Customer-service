
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { UploadCloud, ClipboardCopy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function IdScanner() {
    const { toast } = useToast();
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    React.useEffect(() => {
        // Cleanup the object URL to avoid memory leaks
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            // Basic check for image type
            if (!file.type.startsWith('image/')) {
                toast({
                    variant: 'destructive',
                    title: 'Invalid File Type',
                    description: 'Please upload an image file (e.g., JPG, PNG).',
                });
                return;
            }
            setSelectedFile(file);
            
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl(URL.createObjectURL(file));
        }
    };
    
    const handleCopy = (text: string | undefined) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied to Clipboard',
            description: `Copied: ${text}`,
        });
    }

    return (
        <div className="grid md:grid-cols-2 gap-6 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>1. Upload Document Image</CardTitle>
                    <CardDescription>Select an image of the ID card or passport to display it for manual data entry.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="id-upload">ID Image</Label>
                        <div className="flex items-center gap-2">
                            <Input id="id-upload" type="file" accept="image/*" onChange={handleFileChange} />
                            <Button type="button" onClick={() => document.getElementById('id-upload')?.click()} variant="outline" size="icon">
                                <UploadCloud />
                            </Button>
                        </div>
                    </div>
                    
                    {previewUrl && (
                        <div className="mt-4 border p-2 rounded-lg bg-muted relative">
                            <img src={previewUrl} alt="Document Preview" className="rounded-md w-full h-auto object-contain" />
                        </div>
                    )}

                     {!previewUrl && (
                        <div className="mt-4 border-2 border-dashed border-muted-foreground/50 rounded-lg bg-muted/50 h-64 flex items-center justify-center">
                            <p className="text-muted-foreground">Image preview will appear here</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className="min-h-[300px]">
                <CardHeader>
                    <CardTitle>2. Enter Extracted Information</CardTitle>
                    <CardDescription>Manually type the details from the image on the left. Click to copy.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <InfoInput label="Full Name" placeholder="الاسم الكامل" />
                    <InfoInput label="ID Number" placeholder="الرقم الوطني" />
                    <InfoInput label="Date of Birth" placeholder="YYYY-MM-DD" type="date" />
                    <InfoInput label="Place of Birth" placeholder="مكان الميلاد" />
                    <InfoInput label="Date of Issue" placeholder="YYYY-MM-DD" type="date" />
                    <InfoInput label="Date of Expiry" placeholder="YYYY-MM-DD" type="date" />
                </CardContent>
            </Card>
        </div>
    );
}

function InfoInput({ label, placeholder, type = 'text' }: { label: string, placeholder: string, type?: string }) {
    const [value, setValue] = React.useState('');
    const { toast } = useToast();

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        toast({
            title: 'Copied to Clipboard',
            description: `${label}: ${value}`,
        });
    }

    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <div className="flex items-center gap-2">
                <Input
                    type={type}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="bg-background"
                />
                <Button variant="outline" size="icon" onClick={handleCopy} disabled={!value}>
                    <ClipboardCopy className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
