
'use server';

import { z } from 'zod';
import { createWorker } from 'tesseract.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

interface ParsedID {
    name?: string;
    idNumber?: string;
    birthDate?: string;
    birthPlace?: string;
    issueDate?: string;
}

interface ParsedPassport {
    passportNumber?: string;
    fullName?: string;
    nationality?: string;
    dateOfBirth?: string;
    dateOfExpiry?: string;
    mrzLine1?: string;
    mrzLine2?: string;
}

export type CustomOcrOutput = {
  documentType: 'national_id' | 'passport' | 'unknown';
  details: ParsedID | ParsedPassport | {};
};


export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  data?: CustomOcrOutput;
} | undefined;


const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});

// Parser for Yemeni National ID
function parseNationalId(text: string): ParsedID {
    const details: ParsedID = {};
    
    // Name (الاسم)
    let match = text.match(/(?:الاسم|الاســم)\s*:\s*([\u0600-\u06FF\s]+)/);
    if (match) details.name = match[1].trim();

    // National ID Number (الرقم الوطني)
    match = text.match(/(?:الرقم الوطني|الرقم الوطنـي)\s*[:\s]*(\d{12,})/);
    if (match) details.idNumber = match[1].trim();

    // Birth Date (تاريخ الميلاد)
    match = text.match(/(?:تاريخ الميلاد|تاريخ الميـلاد)\s*[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (match) details.birthDate = match[1].trim();
    
    // Place of Birth (محل الميلاد)
    match = text.match(/(?:محل الميلاد|محل الميـلاد)\s*[:\s]*([\u0600-\u06FF\s]+)/);
    if (match) details.birthPlace = match[1].trim();
    
    // Issue Date (تاريخ الإصدار)
    match = text.match(/(?:تاريخ الإصدار|تاريخ الإصـدار)\s*[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (match) details.issueDate = match[1].trim();

    return details;
}

// Parser for Yemeni Passport
function parsePassport(text: string): ParsedPassport {
    const details: ParsedPassport = {};
    const lines = text.split('\n');

    const getValue = (labelRegex: RegExp): string | undefined => {
        for (const line of lines) {
            const match = line.match(labelRegex);
            if (match && match[1]) {
                return match[1].replace(/</g, '').trim();
            }
        }
        return undefined;
    };
    
    // Passport Number
    details.passportNumber = getValue(/PASSPORT\s*No\.?\s*([A-Z0-9]+)/i);

    // Full Name from SURNAME and GIVEN NAMES
    const surname = getValue(/SURNAME\s*([A-Z\s-]+)/i);
    const givenNames = getValue(/GIVEN\s*NAMES\s*([A-Z\s]+)/i);
    if (surname && givenNames) {
        details.fullName = `${givenNames} ${surname}`.replace(/\s+/g, ' ');
    }
    
    // Nationality
    const countryCode = getValue(/COUNTRY\s*CODE\s*([A-Z]{3})/i);
    if (countryCode === 'YEM') {
        details.nationality = "YEMENI";
    }

    // Dates
    details.dateOfBirth = getValue(/DATE\s*OF\s*BIRTH\s*(\d{2}\/\d{2}\/\d{4})/i);
    details.dateOfExpiry = getValue(/DATE\s*OF\s*EXPIRY\s*(\d{2}\/\d{2}\/\d{4})/i);

    // MRZ (Machine Readable Zone) - a more robust regex
    const mrzMatch = text.match(/(P[A-Z<][A-Z0-9<]{30,})\n([A-Z0-9<]{30,})/i);
     if (mrzMatch) {
        details.mrzLine1 = mrzMatch[1].replace(/\s/g, '');
        details.mrzLine2 = mrzMatch[2].replace(/\s/g, '');
    }
    
    return details;
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
  const imageBuffer = Buffer.from(await documentImage.arrayBuffer());
  
  let worker;
  try {
    worker = await createWorker('ara+eng');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();

    // Determine document type and parse
    let docType: 'national_id' | 'passport' | 'unknown' = 'unknown';
    let parsedDetails: ParsedID | ParsedPassport | {} = {};

    if (text.includes('الجمهورية اليمنية') && (text.includes('بطاقة شخصية') || text.includes('الرقم الوطني'))) {
        docType = 'national_id';
        parsedDetails = parseNationalId(text);
    } else if (text.match(/PASSPORT/i) && text.match(/REPUBLIC OF YEMEN/i)) {
        docType = 'passport';
        parsedDetails = parsePassport(text);
    }

    if (docType === 'unknown' || Object.keys(parsedDetails).filter(k => !!(parsedDetails as any)[k]).length === 0) {
        return {
            error: true,
            message: "Could not identify document type or extract any details from the image."
        };
    }

    return { success: true, data: { documentType: docType, details: parsedDetails }};

  } catch (error: any) {
    console.error("OCR processing error:", error);
    if (worker) {
        await worker.terminate();
    }
    return {
      error: true,
      message: 'An unexpected error occurred during OCR processing.',
    };
  }
}
