'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, FileJson } from 'lucide-react';
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

function ParsedDataDisplay({ data }: { data: any }) {
    if (!data) return null;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5 text-primary" />
                    Extracted Information
                </CardTitle>
                <CardDescription>
                    Document Type: <span className="font-semibold text-primary">{data.documentType}</span>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <pre className="p-4 bg-muted rounded-md text-sm overflow-x-auto">
                    {JSON.stringify(data, null, 2)}
                </pre>
            </CardContent>
        </Card>
    );
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
            fileInputRef.current!.value = "";
            setPreview(null);
        }
    }, [state]);

    return (
        <div className="space-y-6">
            <PageHeader
                title="Document Processing"
                description="Upload a Yemeni ID or Passport to automatically extract information."
            />
            <div className="grid md:grid-cols-2 gap-6">
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
                        <ParsedDataDisplay data={state.data} />
                    )}
                </div>
            </div>
        </div>
    );
}
