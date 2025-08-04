'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, UserSquare2, AlertTriangle, BadgeHelp } from 'lucide-react';
import { processDocument, type DocumentParsingState } from '@/lib/actions/document';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                </>
            ) : (
                <>
                    <UploadCloud className="mr-2 h-4 w-4" />
                    Process Document
                </>
            )}
        </Button>
    );
}

function ExtractedDataDisplay({ data }: { data: NonNullable<DocumentParsingState['data']> }) {
    if (!data.details || data.documentType === 'unknown') {
        return (
            <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Parsing Failed</AlertTitle>
                <AlertDescription>
                    Could not recognize the document type or extract structured fields.
                </AlertDescription>
            </Alert>
        );
    }
    
    if (data.documentType === 'national_id') {
        const idData = data.details;
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserSquare2 className="h-5 w-5 text-primary" />
                        Extracted National ID Data
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 font-mono text-sm">
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Name:</span>
                        <span className="font-semibold text-right" dir="rtl">{idData.name || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">ID Number:</span>
                        <span className="font-semibold">{idData.idNumber || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Birth Place:</span>
                        <span className="font-semibold text-right" dir="rtl">{idData.birthPlace || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Birth Date:</span>
                        <span className="font-semibold">{idData.birthDate || 'Not Found'}</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (data.documentType === 'passport') {
        const passportData = data.details;
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BadgeHelp className="h-5 w-5 text-primary" />
                        Extracted Passport Data
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 font-mono text-sm">
                    <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Passport No:</span>
                        <span className="font-semibold">{passportData.passportNumber || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Full Name:</span>
                        <span className="font-semibold text-right">{passportData.fullName || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Nationality:</span>
                        <span className="font-semibold">{passportData.nationality || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between border-b pb-2">
                        <span className="text-muted-foreground">Birth Date:</span>
                        <span className="font-semibold">{passportData.birthDate || 'Not Found'}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-muted-foreground">Expiry Date:</span>
                        <span className="font-semibold">{passportData.expiryDate || 'Not Found'}</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return null;
}


export default function DocumentProcessingPage() {
    const [state, formAction] = useActionState<DocumentParsingState, FormData>(processDocument, undefined);
    const [preview, setPreview] = React.useState<string | null>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        } else {
            setPreview(null);
        }
    };
    
    React.useEffect(() => {
        // Reset form and preview when a new result comes in
        if (state?.success) {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            setPreview(null);
        }
    }, [state]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Document Processing"
                description="Upload a Yemeni ID or Passport to automatically extract information using AI."
            />
            <div className="grid lg:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                    <form action={formAction}>
                        <Card>
                            <CardHeader>
                                <CardTitle>Upload Document</CardTitle>
                                <CardDescription>Select an image file (JPG, PNG) of the document.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="documentImage">Document Image</Label>
                                        <Input
                                            id="documentImage"
                                            name="documentImage"
                                            type="file"
                                            accept="image/jpeg,image/png"
                                            required
                                            onChange={handleFileChange}
                                            ref={fileInputRef}
                                        />
                                    </div>
                                    {preview && (
                                        <div className="border p-2 rounded-md">
                                            <img src={preview} alt="Document preview" className="max-h-60 w-auto mx-auto rounded-sm" />
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                            <CardFooter>
                                <SubmitButton />
                            </CardFooter>
                        </Card>
                    </form>
                </div>

                <div className="space-y-6">
                    {state?.error && (
                         <Alert variant="destructive">
                            <AlertTitle>Processing Error</AlertTitle>
                            <AlertDescription>{state.message}</AlertDescription>
                        </Alert>
                    )}
                    {state?.success && state.data && (
                        <ExtractedDataDisplay data={state.data} />
                    )}
                </div>
            </div>
        </div>
    );
}
