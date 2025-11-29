import { DocumentOCRProcessor } from '@/components/document-ocr';

export default function DocumentOCRPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Document OCR Processing
          </h1>
          <p className="text-lg text-gray-600">
            Extract data from Yemeni IDs and Passports using advanced AI
          </p>
        </div>
        <DocumentOCRProcessor />
      </div>
    </div>
  );
}
