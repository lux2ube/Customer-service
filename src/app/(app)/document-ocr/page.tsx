import { DocumentOcrUploader } from '@/components/document-ocr-uploader';

export default function DocumentOcrPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Document OCR Extraction</h1>
        <p className="text-gray-600 mt-2">
          Extract text and data from Yemeni IDs and Passports using AI-powered OCR
        </p>
      </div>
      <DocumentOcrUploader />
    </div>
  );
}
