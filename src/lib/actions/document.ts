
'use server';

import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';
import { db, storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';


export type PassportDetails = {
  fullName?: string;
  surname?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  sex?: string;
  dateOfIssue?: string;
  expiryDate?: string;
  placeOfBirth?: string;
  issuingAuthority?: string;
};

export type YemeniIDFrontDetails = {
  name?: string;
  nameArabic?: string;
  idNumber?: string;
  dateOfBirth?: string;
  governorate?: string;
  gender?: string;
  nationality?: string;
  religion?: string;
  profession?: string;
};

export type YemeniIDBackDetails = {
  idNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  maritalStatus?: string;
};

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  rawText?: string;
  parsedData?: {
    documentType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown';
    details: PassportDetails | YemeniIDFrontDetails | YemeniIDBackDetails | Record<string, any>;
  }
} | undefined;


const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 10MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});

// --- Text Treatment ---
function treatOcrText(text: string): string {
    return text
        .replace(/AL-±\)ESI/g, 'AL-KEBSI')
        .replace(/وازسفر/g, 'جواز سفر')
        .replace(/YEMEN OF REPUBLIC/g, 'REPUBLIC OF YEMEN')
        .replace(/31987\//g, '1987/')
        .replace(/yoi/g, 'YEM')
        .replace(/SANA'A—H,Q\$-/g, "SANA'A-H.O")
        .replace(/(\d{2})\/(\d{2})\/(\d{4})¯/g, '$1/$2/$3'); // Fix trailing chars on dates
}

// --- Parsing Functions ---
function parsePassport(text: string) {
    const lines = text.split('\n').filter(line => line.trim() !== '');

    const getVal = (regex: RegExp, source: string = text) => {
        const match = source.match(regex);
        return match?.[1]?.trim() || null;
    };

    const fullName = getVal(/GIVEN NAMES\s*([A-Z\s]+)/) || getVal(/Name\s*([A-Z\s]+)/);
    const surname = getVal(/SURNAME\s*([A-Z\s]+)/);
    const birthDate = getVal(/DATE OF BIRTH\s*(\d{2}\/\d{2}\/\d{4})/);
    const expiryDate = getVal(/DATE OF EXPIRY\s*(\d{2}\/\d{2}\/\d{4})/);
    const issueDate = getVal(/DATE OF ISSUE\s*(\d{2}\/\d{2}\/\d{4})/);
    const passportNo = getVal(/PASSPORT No\s*(\w+)/) || getVal(/رقم جواز السفر\s*(\w+)/);
    
    // MRZ parsing
    const mrzLine1 = getVal(/P[A-Z<]{2}YEM(.*?<<<<)/);
    const mrzLine2 = getVal(/(\w{8,9})<.*(\d{6})\d[MF]<(\d{6})/);

    const details = {
        documentType: 'passport' as const,
        details: {
            fullName: fullName || getVal(/([A-Z]+<<[A-Z<]+)/, mrzLine1 || '')?.replace(/<</g, ' ').replace(/</g, ' '),
            surname: surname,
            passportNumber: passportNo || mrzLine2?.match(/^(\w{8,9})/)?.[1] || null,
            nationality: getVal(/COUNTRY CODE\s*([A-Z]{3})/),
            dateOfBirth: birthDate,
            sex: getVal(/SEX\s*([MF])/i),
            dateOfIssue: issueDate,
            expiryDate: expiryDate,
            placeOfBirth: getVal(/PLACE OF BIRTH\s*([A-Z\s'-]+)/),
            issuingAuthority: getVal(/ISSUING AUTHORITY\s*([A-Z.\s'-]+)/),
        },
    };

    // A simple check to see if we extracted anything meaningful
    if (Object.values(details.details).some(v => v !== null)) {
        return details;
    }
    return null;
}


export async function processDocument(
  prevState: DocumentParsingState,
  formData: FormData
): Promise<DocumentParsingState> {
  const validatedFields = DocumentSchema.safeParse({
    documentImage: formData.get('documentImage'),
  });

  if (!validatedFields.success) {
    return {
      error: true,
      message: validatedFields.error.flatten().fieldErrors.documentImage?.[0] || 'Invalid file.',
    };
  }
  
  const { documentImage } = validatedFields.data;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Convert file to base64
    const arrayBuffer = await documentImage.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const extractionPrompt = `Analyze this document image and determine its type and extract specific fields.

FIRST, identify which document this is:
- Yemeni ID Front (has personal info, photo, ID number, governorate)
- Yemeni ID Back (has dates, marital status, signatures)
- Passport (has machine readable zone, passport number, travel pages)

THEN extract ONLY the fields relevant to that document type:

For Yemeni ID FRONT:
- name (English)
- nameArabic (Arabic name)
- idNumber
- dateOfBirth (format: DD/MM/YYYY)
- governorate
- gender
- nationality
- religion
- profession

For Yemeni ID BACK:
- idNumber (to verify it's the same ID)
- issueDate (format: DD/MM/YYYY)
- expiryDate (format: DD/MM/YYYY)
- maritalStatus

For PASSPORT:
- fullName
- surname
- passportNumber
- nationality
- dateOfBirth (format: DD/MM/YYYY)
- sex (M or F)
- dateOfIssue (format: DD/MM/YYYY)
- expiryDate (format: DD/MM/YYYY)
- placeOfBirth
- issuingAuthority

Return ONLY valid JSON with the documentType as "yemeni_id_front", "yemeni_id_back", or "passport", and the extracted fields. If a field isn't visible, omit it.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: [
        {
          inlineData: {
            data: base64,
            mimeType: documentImage.type,
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
    let extractedData: any = {};
    
    try {
      extractedData = JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    }

    // Get document type from response or determine it
    let documentType: 'yemeni_id_front' | 'yemeni_id_back' | 'passport' | 'unknown' = 
      extractedData.documentType || 'unknown';
    let details: any = {};

    if (documentType === 'passport') {
      details = {
        fullName: extractedData.fullName,
        surname: extractedData.surname,
        passportNumber: extractedData.passportNumber,
        nationality: extractedData.nationality,
        dateOfBirth: extractedData.dateOfBirth,
        sex: extractedData.sex,
        dateOfIssue: extractedData.dateOfIssue,
        expiryDate: extractedData.expiryDate,
        placeOfBirth: extractedData.placeOfBirth,
        issuingAuthority: extractedData.issuingAuthority,
      };
    } else if (documentType === 'yemeni_id_front') {
      details = {
        name: extractedData.name,
        nameArabic: extractedData.nameArabic,
        idNumber: extractedData.idNumber,
        dateOfBirth: extractedData.dateOfBirth,
        governorate: extractedData.governorate,
        gender: extractedData.gender,
        nationality: extractedData.nationality,
        religion: extractedData.religion,
        profession: extractedData.profession,
      };
    } else if (documentType === 'yemeni_id_back') {
      details = {
        idNumber: extractedData.idNumber,
        issueDate: extractedData.issueDate,
        expiryDate: extractedData.expiryDate,
        maritalStatus: extractedData.maritalStatus,
      };
    }
    
    // Fallback: if no documentType detected, try to infer
    if (documentType === 'unknown') {
      if (extractedData.passportNumber) {
        documentType = 'passport';
        details = extractedData;
      } else if (extractedData.name && extractedData.profession) {
        documentType = 'yemeni_id_front';
        details = extractedData;
      } else if (extractedData.idNumber && extractedData.issueDate) {
        documentType = 'yemeni_id_back';
        details = extractedData;
      }
    }

    const rawText = JSON.stringify(extractedData, null, 2);
    
    return {
      success: true,
      rawText: rawText,
      parsedData: {
        documentType,
        details,
      },
    };

  } catch (error: any) {
    console.error("Document Processing Error:", error);
    return { error: true, message: error.message || 'An unexpected error occurred during processing.' };
  }
}
