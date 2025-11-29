'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDocumentData, DocumentExtractionResult, YemeniIDData, PassportData } from '@/lib/actions/document-ocr';
import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function DocumentOCRProcessor() {
  const [result, setResult] = useState<DocumentExtractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    try {
      // Convert file to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUrl = `data:${file.type};base64,${base64}`;

      const extractionResult = await extractDocumentData(dataUrl);
      setResult(extractionResult);
    } catch (error) {
      setResult({
        success: false,
        documentType: 'unknown',
        data: null,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Failed to process document',
      });
    } finally {
      setLoading(false);
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      yemeni_id_front: 'Yemeni ID - Front',
      yemeni_id_back: 'Yemeni ID - Back',
      passport: 'Passport',
      unknown: 'Unknown Document',
    };
    return labels[type] || 'Unknown';
  };

  const renderExtractedData = () => {
    if (!result?.data) return null;

    const data = result.data as any;
    const fields = Object.entries(data).filter(([, value]) => value);

    return (
      <div className="space-y-2">
        {fields.map(([key, value]) => (
          <div key={key} className="flex justify-between py-2 border-b">
            <span className="font-semibold text-gray-700 capitalize">
              {key.replace(/([A-Z])/g, ' $1').trim()}:
            </span>
            <span className="text-gray-900">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Document OCR Processing</CardTitle>
          <CardDescription>
            Upload images of Yemeni IDs or passports to extract data using AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={loading}
              className="hidden"
            />
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-2" />
            <p className="text-gray-700 font-medium">Click to upload or drag and drop</p>
            <p className="text-gray-500 text-sm">PNG, JPG, GIF up to 10MB</p>
          </div>

          {/* Preview */}
          {preview && (
            <div className="relative">
              <img
                src={preview}
                alt="Document preview"
                className="max-w-full h-auto rounded-lg border"
              />
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mr-2" />
              <span className="text-gray-700">Processing document...</span>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                {result.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-green-700 font-medium">Successfully processed</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    <span className="text-red-700 font-medium">Processing failed</span>
                  </>
                )}
              </div>

              {/* Document Type & Confidence */}
              {result.success && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold text-gray-700">
                      {getDocumentTypeLabel(result.documentType)}
                    </span>
                    <span className="text-sm font-medium text-blue-600">
                      {result.confidence}% confidence
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${result.confidence}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Extracted Data */}
              {result.success && result.data && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-gray-900 mb-4">Extracted Data</h3>
                  {renderExtractedData()}
                </div>
              )}

              {/* Error Message */}
              {!result.success && result.error && (
                <div className="bg-red-50 p-4 rounded-lg text-red-700">
                  <p className="font-medium">Error: {result.error}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setResult(null);
                    setPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  variant="outline"
                >
                  Clear
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  Upload Another
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
