
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { ClipboardCopy, FileScan, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useActionState, useFormStatus } from 'react-dom';
import { processIdDocumentWithTesseract, type ExtractedDataState } from '@/lib/actions';

function ScanButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Scanning Document...
                </>
            ) : (
                <>
                    <FileScan className="mr-2 h-4 w-4" />
                    Extract Information
                </>
            )}
        </Button>
    )
}

function InfoDisplayRow({ label, value }: { label: string, value: string | undefined }) {
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
        <div className="flex items-center justify-between p-3 border-b last:border-b-0">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-right" dir="rtl">{value || 'N/A'}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} disabled={!value}>
                    <ClipboardCopy className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

export function IdScanner() {
    const { toast } = useToast();
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);

    const [state, formAction] = useActionState<ExtractedDataState, FormData>(processIdDocumentWithTesseract, null);

    React.useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
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

    return (
        <form action={formAction} className="grid md:grid-cols-2 gap-6 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>1. Upload Document Image</CardTitle>
                    <CardDescription>Select an image of the ID card or passport to display it and begin extraction.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <Label htmlFor="id-upload">ID Image</Label>
                        <Input id="id-upload" name="idImage" type="file" accept="image/*" onChange={handleFileChange} required />
                    </div>
                    
                    {previewUrl ? (
                        <div className="mt-4 border p-2 rounded-lg bg-muted relative">
                            <img src={previewUrl} alt="Document Preview" className="rounded-md w-full h-auto object-contain" />
                        </div>
                    ) : (
                        <div className="mt-4 border-2 border-dashed border-muted-foreground/50 rounded-lg bg-muted/50 h-64 flex items-center justify-center">
                            <p className="text-muted-foreground">Image preview will appear here</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <ScanButton />
                </CardFooter>
            </Card>

            <Card className="min-h-[300px]">
                <CardHeader>
                    <CardTitle>2. Extracted Information</CardTitle>
                    <CardDescription>The extracted details will appear below. Click to copy any value.</CardDescription>
                </CardHeader>
                <CardContent>
                    {state?.error && (
                        <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-md">
                            <AlertCircle className="h-4 w-4" />
                            <p>{state.error}</p>
                        </div>
                    )}
                    {state?.data && (
                        <div className="border rounded-md">
                            <InfoDisplayRow label="الاسم" value={state.data.name} />
                            <InfoDisplayRow label="الرقم الوطني" value={state.data.nationalId} />
                            <InfoDisplayRow label="تاريخ الميلاد" value={state.data.dob} />
                            <InfoDisplayRow label="مكان الميلاد" value={state.data.pob} />
                            <InfoDisplayRow label="تاريخ الإصدار" value={state.data.issueDate} />
                            <InfoDisplayRow label="تاريخ الإنتهاء" value={state.data.expiryDate} />
                        </div>
                    )}
                </CardContent>
            </Card>
        </form>
    );
}
