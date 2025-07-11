
'use client';

import * as React from 'react';
import { createWorker } from 'tesseract.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Loader2, ScanLine, Sparkles, AlertCircle } from 'lucide-react';
import { Progress } from './ui/progress';
import { Textarea } from './ui/textarea';
import { extractIdInfo, type ExtractedIdInfo } from '@/ai/flows/extract-id-info-flow';
import { useToast } from '@/hooks/use-toast';
import { Separator } from './ui/separator';

export function IdScanner() {
    const { toast } = useToast();
    const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
    
    const [ocrProgress, setOcrProgress] = React.useState(0);
    const [ocrStatus, setOcrStatus] = React.useState('');
    const [isProcessingOcr, setIsProcessingOcr] = React.useState(false);
    
    const [rawText, setRawText] = React.useState('');
    const [isStructuring, setIsStructuring] = React.useState(false);
    const [structuredData, setStructuredData] = React.useState<ExtractedIdInfo | null>(null);

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
            setRawText('');
            setStructuredData(null);
            
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl(URL.createObjectURL(file));
        }
    };
    
    const handleOcr = async () => {
        if (!selectedFile) {
            toast({ variant: 'destructive', title: 'No file selected', description: 'Please upload an image first.' });
            return;
        }

        setIsProcessingOcr(true);
        setOcrProgress(0);
        setOcrStatus('Initializing...');
        setRawText('');
        setStructuredData(null);

        const worker = await createWorker();

        try {
            await worker.loadLanguage('ara');
            await worker.initialize('ara');
            const { data: { text } } = await worker.recognize(selectedFile, {}, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        setOcrProgress(Math.round(m.progress * 100));
                    }
                    setOcrStatus(m.status);
                }
            });
            setRawText(text);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'OCR Failed', description: 'An error occurred during text recognition.' });
        } finally {
            await worker.terminate();
            setIsProcessingOcr(false);
        }
    };

    const handleStructuring = async () => {
        if (!rawText) {
            toast({ variant: 'destructive', title: 'No text to process', description: 'Please run OCR first to extract text.' });
            return;
        }
        
        setIsStructuring(true);
        setStructuredData(null);
        try {
            const result = await extractIdInfo({ rawOcrText: rawText });
            if (result.error) {
                 toast({ variant: 'destructive', title: 'AI Structuring Failed', description: result.error });
            } else {
                setStructuredData(result);
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'AI Structuring Failed', description: 'An unexpected error occurred.' });
        } finally {
            setIsStructuring(false);
        }
    };

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>1. Upload Document</CardTitle>
                    <CardDescription>Select an image of the ID card or passport.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Input id="id-upload" type="file" accept="image/*" onChange={handleFileChange} />
                    {previewUrl && (
                        <div className="mt-4 border p-2 rounded-lg bg-muted">
                            <img src={previewUrl} alt="Document Preview" className="rounded-md w-full max-h-80 object-contain" />
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex flex-col items-stretch gap-4">
                     <Button onClick={handleOcr} disabled={!selectedFile || isProcessingOcr}>
                        {isProcessingOcr ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanLine className="mr-2 h-4 w-4" />}
                        {isProcessingOcr ? 'Extracting Text...' : '2. Extract Text (OCR)'}
                    </Button>
                    {isProcessingOcr && (
                        <div className="space-y-2">
                             <Progress value={ocrProgress} />
                             <p className="text-sm text-muted-foreground text-center font-mono">{ocrStatus} ({ocrProgress}%)</p>
                        </div>
                    )}
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>3. Verify &amp; Structure Data</CardTitle>
                    <CardDescription>Review the raw text and use AI to structure it.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <Label htmlFor="raw-text">Raw Extracted Text</Label>
                        <Textarea id="raw-text" value={rawText} onChange={(e) => setRawText(e.target.value)} rows={8} placeholder="Text extracted from the document will appear here." />
                    </div>
                     <Button onClick={handleStructuring} disabled={!rawText || isStructuring} className="w-full">
                        {isStructuring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                        Structure Data with AI
                    </Button>

                    {structuredData && (
                        <div className="space-y-4 pt-4">
                             <Separator />
                            <h3 className="font-semibold">Structured Information</h3>
                             {!structuredData.isIdDocument && (
                                <div className="flex items-center gap-2 text-destructive p-3 bg-destructive/10 rounded-md">
                                    <AlertCircle className="h-5 w-5" />
                                    <p className="text-sm">The AI could not confidently identify this as an ID document.</p>
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono">
                                <p><strong>Name:</strong> {structuredData.fullName}</p>
                                <p><strong>ID Number:</strong> {structuredData.idNumber}</p>
                                <p><strong>DoB:</strong> {structuredData.dateOfBirth}</p>
                                <p><strong>Issue Date:</strong> {structuredData.dateOfIssue}</p>
                                <p><strong>Expiry:</strong> {structuredData.dateOfExpiry}</p>
                                <p><strong>PoB:</strong> {structuredData.placeOfBirth}</p>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
