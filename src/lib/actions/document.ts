
'use server';

import { z } from 'zod';
import { createWorker } from 'tesseract.js';
import path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

interface ParsedID {
    documentType: 'national_id';
    name?: string;
    idNumber?: string;
    birthDate?: string;
    birthPlace?: string;
}

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  data?: {
    rawText: string;
    parsedData?: ParsedID | { documentType: 'unknown' };
  };
} | undefined;


const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});

function parseNationalId(text: string): ParsedID | null {
    if (!text.includes('الجمهورية اليمنية') && !text.includes('بطاقة شخصية')) {
        return null;
    }

    const lines = text.split('\n');
    const result: ParsedID = { documentType: 'national_id' };

    const findValueAfterLabel = (labelRegex: RegExp): string | undefined => {
        for (const line of lines) {
            const match = line.match(labelRegex);
            if (match && match[1]) {
                return match[1].trim().replace(/L/g, ' ').replace(/:/g, '').trim();
            }
        }
        return undefined;
    };
    
    result.name = findValueAfterLabel(/(?:الاسم|الاسـم)\s*[:\sL]*(.+)/);
    result.idNumber = findValueAfterLabel(/(?:الرقم الوطني|الرقم)\s*[:\sL]*(\d+)/);
    result.birthPlace = findValueAfterLabel(/(?:محل الميلاد|محلالميلاد)\s*[:\sL]*(.+)/);
    result.birthDate = findValueAfterLabel(/(?:تاريخ الميلاد|تاريخالميلاد)\s*[:\sL]*([\d\/]+)/);

    if (result.idNumber) {
        return result;
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
  const imageBuffer = Buffer.from(await documentImage.arrayBuffer());
  
  let worker;
  try {
    // Using a CDN for language data is more reliable in some server environments
    worker = await createWorker('ara', 1, {
        langPath: 'https://tessdata.projectnaptha.com/4.0.0', // Using a reliable CDN
        cacheMethod: 'none',
    });
    
    const { data: { text } } = await worker.recognize(imageBuffer);
    
    await worker.terminate();

    if (!text || text.trim().length === 0) {
        return {
            success: true, // It's a successful OCR run, even if it found nothing
            data: { 
                rawText: "OCR did not extract any text from the image. It might be blank or too blurry.",
                parsedData: { documentType: 'unknown' }
            }
        };
    }
    
    const parsedData = parseNationalId(text);

    return { 
        success: true, 
        data: { 
            rawText: text,
            parsedData: parsedData || { documentType: 'unknown' }
        }
    };

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
