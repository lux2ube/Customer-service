
'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, UploadCloud, FileText, User, Fingerprint, Calendar, Building, ShieldAlert, BadgeInfo, UserPlus } from 'lucide-react';
import { processDocument, type DocumentParsingState } from '@/lib/actions/document';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DocumentClientForm } from '@/components/document-client-form';

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

function ParsedDataDisplay({ 
    data, 
    onAddClient 
}: { 
    data: NonNullable<DocumentParsingState['parsedData']>,
    onAddClient: () => void
}) {
    if (!data.details || data.documentType === 'unknown') {
        return (
            <Alert>
                <BadgeInfo className="h-4 w-4" />
                <AlertTitle>Could Not Identify Document</AlertTitle>
                <AlertDescription>The OCR text could not be reliably parsed into known fields.</AlertDescription>
            </Alert>
        );
    }
    
    const isPassport = data.documentType === 'passport';

    const fields = isPassport ?
        [
            { label: "Full Name", value: data.details.fullName, icon: User },
            { label: "Surname", value: data.details.surname, icon: User },
            { label: "Passport No.", value: data.details.passportNumber, icon: Fingerprint },
            { label: "Nationality", value: data.details.nationality, icon: ShieldAlert },
            { label: "Date of Birth", value: data.details.dateOfBirth, icon: Calendar },
            { label: "Date of Issue", value: data.details.dateOfIssue, icon: Calendar },
            { label: "Date of Expiry", value: data.details.expiryDate, icon: Calendar },
            { label: "Place of Birth", value: data.details.placeOfBirth, icon: Building },
            { label: "Sex", value: data.details.sex, icon: User },
            { label: "Issuing Authority", value: data.details.issuingAuthority, icon: Building },
        ] :
        [ // For National ID, can be expanded later
            { label: "Name", value: data.details.name, icon: User },
            { label: "ID Number", value: data.details.idNumber, icon: Fingerprint },
            { label: "Date of Birth", value: data.details.birthDate, icon: Calendar },
            { label: "Place of Birth", value: data.details.birthPlace, icon: Building },
        ];


    return (
         <Card>
            <CardHeader>
                <CardTitle className="flex items-center justify-between">
                    Extracted Information
                    <Badge variant="secondary" className="capitalize">{data.documentType.replace('_', ' ')}</Badge>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {fields.map((field, index) => field.value && (
                    <div key={index} className="flex items-start justify-between text-sm border-b pb-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <field.icon className="h-4 w-4" />
                            <span>{field.label}</span>
                        </div>
                        <span className="font-medium text-right">{field.value}</span>
                    </div>
                ))}
            </CardContent>
            <CardFooter>
                <Button onClick={onAddClient} className="w-full">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add New Client
                </Button>
            </CardFooter>
        </Card>
    );
}

export default function DocumentProcessingPage() {
    const [state, formAction] = useActionState<DocumentParsingState, FormData>(processDocument, undefined);
    const [preview, setPreview] = React.useState<string | null>(null);
    const [showClientForm, setShowClientForm] = React.useState(false);
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
                description="Upload a Yemeni ID or Passport to automatically extract information."
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
                    {state?.success && state.parsedData && (
                        <ParsedDataDisplay 
                            data={state.parsedData}
                            onAddClient={() => setShowClientForm(true)}
                        />
                    )}

                    {state?.rawText && (
                        <Card>
                             <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-primary" />
                                    Extracted & Corrected Text
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Textarea 
                                    readOnly
                                    value={state.rawText}
                                    className="min-h-[200px] font-mono text-xs bg-muted"
                                />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {state?.success && state.parsedData && (
                <DocumentClientForm
                    open={showClientForm}
                    onOpenChange={setShowClientForm}
                    extractedData={state.parsedData.details}
                    documentType={state.parsedData.documentType}
                />
            )}
        </div>
    );
}
