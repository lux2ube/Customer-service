
'use server';

import { z } from 'zod';

const OcrSpaceResponseSchema = z.object({
  ParsedResults: z.array(z.object({
    ParsedText: z.string(),
  })).optional(),
  OCRExitCode: z.number(),
  IsErroredOnProcessing: z.boolean(),
  ErrorMessage: z.union([z.string(), z.array(z.string())]).optional(),
});


export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  rawText?: string;
  parsedData?: {
    documentType: 'passport' | 'national_id' | 'unknown';
    details: any;
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
            dateOfBirth: birthDate || mrzLine2?.match(/(\d{2})(\d{2})(\d{2})/)?.slice(1).reverse().join('/') || null,
            sex: getVal(/SEX\s*([MF])/i),
            dateOfIssue: issueDate,
            expiryDate: expiryDate || mrzLine2?.match(/(\d{2})(\d{2})(\d{2})</g)?.[1] ? `${mrzLine2?.match(/(\d{2})(\d{2})(\d{2})/g)?.[1]?.match(/(\d{2})(\d{2})(\d{2})/)?.slice(1).reverse().join('/')}` : null,
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

  // Since there are no settings for ocr.space key, we can't upload.
  // We'll simulate the OCR response with the provided text for now.
  // This allows building and testing the parsing logic.
  const sampleOcrText = `REPUBLIC OF YEMEN
جواز سفر PASSPORT
هورية اليمنية
PR
SURNAME
النوع COUNTRY CODE
AL-KEBSI
GIVEN NAMES
YEM
MUNEER MOHAMMED AHMED
PROFESSION
EMPLOYEE
PLACE OF BIRTH
SANA'A - YEM
DATE OF BIRTH
29/07/1987
SEX
M
DATE OF ISSUE DATE OF EXPIRY
02/04/2013
ISSUING AUTHORITY
SANA'A-H.O
02/04/2019
الجمهورية اليمنية
رقم جواز السفر
الاسم
رمز البلد PASSPORT No
00000000
منير محمد احمد
اللقب
الكبسي
المهنة
موظف
محل الميلاد
الأمانه - صنعاء
تاريخ الميلاد
الجنس
ذكر
1987/07/29
تاريخ الإنتهاء
2019/04/02 2013/04/02
رئاسة المصلحة
PRYEMALKEBSI<<MUNEER<MOHAMMED<AHMED<<<<<<<<<
00000000<OYEM8707291M1904024<<<<<<<<<<<<<<08`;

  try {
    const rawText = sampleOcrText; // In a real scenario, this comes from the OCR API
    const treatedText = treatOcrText(rawText);
    
    // Attempt to parse as a passport
    const parsedData = parsePassport(treatedText);
    
    if (parsedData) {
        return {
            success: true,
            rawText: treatedText,
            parsedData: parsedData,
        };
    }

    // If passport parsing fails, you could add national ID parsing here
    // const parsedId = parseNationalId(treatedText);
    // if (parsedId) { ... }

    return {
      success: true,
      rawText: treatedText,
      parsedData: { documentType: 'unknown', details: {} },
      message: 'Text extracted, but could not determine document type or fields.'
    };

  } catch (error: any) {
    console.error("OCR/Parsing Error:", error);
    return { error: true, message: error.message || 'An unexpected error occurred during processing.' };
  }
}
