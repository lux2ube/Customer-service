
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

// Parser for Yemeni Passport - updated with more robust regex
function parsePassport(text: string): ParsedPassport {
    const details: ParsedPassport = {};
    
    const getValue = (label: string) => {
        // This regex looks for the label and captures the rest of the line, ignoring Arabic text in between
        const pattern = new RegExp(`${label}\\s*(?:[\\u0600-\\u06FF\\s]*[:\\s]*)?([A-Z0-9\\s/\\-]+)`, 'im');
        const match = text.match(pattern);
        return match ? match[1].trim() : undefined;
    };
    
    const getDate = (label: string) => {
        const pattern = new RegExp(`${label}\\s*(\\d{2}\\/\\d{2}\\/\\d{4})`, 'im');
        const match = text.match(pattern);
        return match ? match[1] : undefined;
    }

    // Passport Number
    details.passportNumber = getValue('PASSPORT No');

    // Full Name
    const surname = getValue('SURNAME');
    const givenNames = getValue('GIVEN NAMES');
    if (surname && givenNames) {
        details.fullName = `${givenNames} ${surname}`.replace(/\s+/g, ' ').trim();
    } else {
        details.fullName = getValue('Name');
    }

    // Dates
    details.dateOfBirth = getDate('DATE OF BIRTH');
    details.dateOfExpiry = getDate('DATE OF EXPIRY');

    // Nationality
    if (text.match(/YEM|YEMENI/i)) {
        details.nationality = 'YEMENI';
    }

    // MRZ (Machine Readable Zone)
    const mrzMatch = text.match(/(P[A-Z<]{1}YEM[A-Z0-9<]{39})\s*\n\s*([A-Z0-9<]{44})/i);
    if (mrzMatch) {
        details.mrzLine1 = mrzMatch[1].replace(/\s/g, '');
        details.mrzLine2 = mrzMatch[2].replace(/\s/g, '');

        // Extract from MRZ as a fallback
        if (!details.passportNumber) details.passportNumber = details.mrzLine2.substring(0, 9).replace(/</g, '');
        if (!details.dateOfBirth) {
            const dobMRZ = details.mrzLine2.substring(13, 19);
            details.dateOfBirth = `${dobMRZ.substring(4, 6)}/${dobMRZ.substring(2, 4)}/19${dobMRZ.substring(0, 2)}`;
        }
        if (!details.dateOfExpiry) {
            const doeMRZ = details.mrzLine2.substring(21, 27);
            details.dateOfExpiry = `${doeMRZ.substring(4, 6)}/${doeMRZ.substring(2, 4)}/20${doeMRZ.substring(0, 2)}`;
        }
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
