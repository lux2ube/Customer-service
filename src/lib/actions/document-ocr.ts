'use server';

import { GoogleGenAI } from '@google/genai';

export interface YemeniIDData {
  idNumber?: string;
  fullName?: string;
  nameArabic?: string;
  dateOfBirth?: string;
  issueDate?: string;
  expiryDate?: string;
  governorate?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  maritalStatus?: string;
  profession?: string;
}

export interface PassportData {
  passportNumber?: string;
  fullName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingCountry?: string;
  machineReadableZone?: string;
}

export interface DocumentExtractionResult {
  success: boolean;
  documentType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown';
  data: YemeniIDData | PassportData | null;
  rawText?: string;
  confidence: number;
  error?: string;
}

async function encodeImageToBase64(imageUrl: string): Promise<string> {
  try {
    // If it's a data URL, extract the base64 part
    if (imageUrl.startsWith('data:')) {
      return imageUrl.split(',')[1];
    }
    
    // If it's a file path or URL, fetch and convert
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (error) {
    throw new Error(`Failed to encode image: ${error}`);
  }
}

export async function extractDocumentData(
  imageUrl: string,
  documentType?: string
): Promise<DocumentExtractionResult> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const base64Image = await encodeImageToBase64(imageUrl);

    // Determine document type if not provided
    const typeDetectionPrompt = documentType 
      ? `This is a ${documentType}. Extract all fields.`
      : 'First identify if this is a Yemeni ID (front/back), passport, or other document. Then extract all relevant fields.';

    const extractionPrompt = `${typeDetectionPrompt}

For Yemeni ID Front:
- ID Number
- Full Name (English and Arabic)
- Date of Birth
- Governorate
- Gender
- Nationality
- Religion
- Profession

For Yemeni ID Back:
- Issue Date
- Expiry Date
- Marital Status
- Additional details visible

For Passport:
- Passport Number
- Full Name
- Date of Birth
- Gender
- Nationality
- Issue Date
- Expiry Date
- Issuing Country
- Machine Readable Zone (if visible)

Please extract and structure the data as JSON. If a field is not visible or readable, omit it. Return only valid JSON without markdown formatting.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          inlineData: {
            data: base64Image,
            mimeType: 'image/jpeg',
          },
        },
        {
          text: extractionPrompt,
        },
      ],
      config: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    
    // Parse the JSON response
    let extractedData: any = {};
    try {
      extractedData = JSON.parse(responseText);
    } catch (parseError) {
      // Try to extract JSON if it contains markdown formatting
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    // Detect document type from extracted data
    let detectedType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown' = 'unknown';
    
    if (extractedData.passportNumber) {
      detectedType = 'passport';
    } else if (extractedData.idNumber) {
      // Check if it's front or back based on available fields
      if (extractedData.governorate || extractedData.gender) {
        detectedType = 'yemeni_id_front';
      } else if (extractedData.issueDate || extractedData.expiryDate || extractedData.maritalStatus) {
        detectedType = 'yemeni_id_back';
      } else {
        detectedType = 'yemeni_id_front'; // Default to front if unsure
      }
    }

    // Calculate confidence based on extracted fields
    const fieldCount = Object.keys(extractedData).filter(k => extractedData[k]).length;
    const confidence = Math.min(100, (fieldCount / 5) * 100);

    return {
      success: true,
      documentType: detectedType,
      data: extractedData,
      rawText: responseText,
      confidence: Math.round(confidence),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      documentType: 'unknown',
      data: null,
      confidence: 0,
      error: errorMessage,
    };
  }
}

export async function batchProcessDocuments(
  imageUrls: string[]
): Promise<DocumentExtractionResult[]> {
  const results = await Promise.all(
    imageUrls.map(url => extractDocumentData(url))
  );
  return results;
}
