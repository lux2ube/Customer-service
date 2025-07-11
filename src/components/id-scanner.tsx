
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Loader2, AlertCircle, UploadCloud, Sparkles, CheckCircle } from 'lucide-react';
import { extractIdInfo, type ExtractedIdInfo } from '@/ai/flows/extract-id-info-flow';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';

export function IdScanner() {
    const { toast } = useToast();
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [structuredData, setStructuredData] = React.useState<ExtractedIdInfo | null>(null);
    const [error, setError] = React.useState<string | null>(null);

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
            setSelectedFile(file);
            setStructuredData(null);
            setError(null);
            
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl(URL.createObjectURL(file));
        }
    };
    
    const handleProcess = async () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'No file selected', description: 'Please upload an image first.' });
            return;
        }

        setIsProcessing(true);
        setStructuredData(null);
        setError(null);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(selectedFile);
            reader.onloadend = async () => {
                const imageDataUri = reader.result as string;
                const result = await extractIdInfo({ imageDataUri });

                if (result.error) {
                    setError(result.error);
                } else {
                    setStructuredData(result);
                }
                setIsProcessing(false);
            };
            reader.onerror = () => {
                throw new Error("Failed to read the file.");
            };
        } catch (err) {
            console.error(err);
            const errorMessage = (err instanceof Error) ? err.message : 'An unexpected error occurred.';
            setError(errorMessage);
            toast({ variant: 'destructive', title: 'Processing Failed', description: errorMessage });
            setIsProcessing(false);
        }
    };

    return (
        <div className="grid md:grid-cols-2 gap-6 items-start">
            <Card>
                <CardHeader>
                    <CardTitle>1. Upload Document Image</CardTitle>
                    <CardDescription>Select an image of the ID card or passport. The system will handle the rest.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="id-upload">ID Image</Label>
                        <Input id="id-upload" type="file" accept="image/*" onChange={handleFileChange} />
                    </div>
                    
                    {previewUrl && (
                        <div className="mt-4 border p-2 rounded-lg bg-muted relative">
                            <img src={previewUrl} alt="Document Preview" className="rounded-md w-full max-h-80 object-contain" />
                        </div>
                    )}
                     <Button onClick={handleProcess} disabled={!selectedFile || isProcessing} className="w-full">
                        {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        {isProcessing ? 'Analyzing Document...' : '2. Analyze Document'}
                    </Button>
                </CardContent>
            </Card>

            <Card className="min-h-[300px]">
                <CardHeader>
                    <CardTitle>3. Extracted Information</CardTitle>
                    <CardDescription>Results from the AI analysis will appear here.</CardDescription>
                </CardHeader>
                <CardContent>
                    {isProcessing && (
                        <div className="flex flex-col items-center justify-center text-muted-foreground pt-12">
                            <Loader2 className="h-8 w-8 animate-spin mb-4" />
                            <p>Performing OCR and extracting data...</p>
                        </div>
                    )}
                    {error && (
                        <div className="flex flex-col items-center justify-center text-destructive pt-12 text-center">
                            <AlertCircle className="h-8 w-8 mb-4" />
                            <p className="font-semibold">Analysis Failed</p>
                            <p className="text-sm">{error}</p>
                        </div>
                    )}
                    {structuredData && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-green-600">
                                <CheckCircle className="h-5 w-5" />
                                <p className="font-semibold">Analysis Complete</p>
                            </div>
                            <Separator />
                             {!structuredData.isIdDocument && (
                                <div className="flex items-center gap-2 text-destructive p-3 bg-destructive/10 rounded-md">
                                    <AlertCircle className="h-5 w-5" />
                                    <p className="text-sm">The AI could not confidently identify this as an ID document.</p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                <InfoItem label="Full Name" value={structuredData.fullName} />
                                <InfoItem label="ID Number" value={structuredData.idNumber} />
                                <InfoItem label="Date of Birth" value={structuredData.dateOfBirth} />
                                <InfoItem label="Place of Birth" value={structuredData.placeOfBirth} />
                                <InfoItem label="Date of Issue" value={structuredData.dateOfIssue} />
                                <InfoItem label="Date of Expiry" value={structuredData.dateOfExpiry} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function InfoItem({ label, value }: { label: string, value?: string }) {
    return (
        <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-mono bg-muted/50 p-2 rounded-md break-words min-h-[36px]">
                {value || <span className="text-muted-foreground/50">N/A</span>}
            </p>
        </div>
    );
}
