'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ExtractedData {
  documentType: string;
  fields: Record<string, string>;
  rawText: string;
  confidence: 'high' | 'medium' | 'low';
}

export function DocumentOcrUploader() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('yemeni_id_front');
  const [loading, setLoading] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please select an image file (JPG, PNG, etc.)',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'No file selected',
        description: 'Please select an image first',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('documentType', documentType);

      const response = await fetch('/api/ocr/process-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('OCR processing failed');
      }

      const result = await response.json();
      if (result.success) {
        setExtractedData(result.data);
        toast({
          title: 'Document processed successfully',
          description: `Extracted ${Object.keys(result.data.fields).length} fields`,
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      toast({
        title: 'Processing failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreview(null);
    setExtractedData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Document OCR Extraction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Document Type Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Document Type</Label>
            <RadioGroup value={documentType} onValueChange={setDocumentType}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yemeni_id_front" id="yemeni-id-front" />
                  <Label htmlFor="yemeni-id-front" className="cursor-pointer">
                    Yemeni ID (Front)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="yemeni_id_back" id="yemeni-id-back" />
                  <Label htmlFor="yemeni-id-back" className="cursor-pointer">
                    Yemeni ID (Back)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="passport" id="passport" />
                  <Label htmlFor="passport" className="cursor-pointer">
                    Passport
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="unknown" id="unknown" />
                  <Label htmlFor="unknown" className="cursor-pointer">
                    Auto-Detect
                  </Label>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* File Upload Area */}
          <div
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm font-medium">Click to upload or drag and drop</p>
            <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
          </div>

          {/* Image Preview */}
          {preview && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <img src={preview} alt="Document preview" className="max-h-64 rounded-lg border" />
              <p className="text-xs text-gray-500">{selectedFile?.name}</p>
            </div>
          )}

          {/* Action Buttons */}
          {selectedFile && !extractedData && (
            <div className="flex gap-2">
              <Button onClick={handleUpload} disabled={loading} className="flex-1">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Extract Text'
                )}
              </Button>
              <Button onClick={handleClear} variant="outline">
                Clear
              </Button>
            </div>
          )}

          {/* Extracted Data Display */}
          {extractedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium">Extraction Complete</span>
              </div>

              {extractedData.confidence !== 'high' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Confidence: {extractedData.confidence}. Please review results carefully.
                  </AlertDescription>
                </Alert>
              )}

              {/* Extracted Fields */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">Extracted Fields</Label>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 max-h-64 overflow-y-auto">
                  {Object.entries(extractedData.fields).length > 0 ? (
                    Object.entries(extractedData.fields).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-start gap-2 text-sm">
                        <span className="font-medium text-gray-700">{key}:</span>
                        <span className="text-gray-900 text-right">{value}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No fields extracted</p>
                  )}
                </div>
              </div>

              {/* Raw Text */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Raw Extracted Text</Label>
                <div className="bg-gray-50 rounded-lg p-3 text-xs max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-gray-700">
                  {extractedData.rawText || 'No text extracted'}
                </div>
              </div>

              <Button onClick={handleClear} variant="outline" className="w-full">
                Process Another Document
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
