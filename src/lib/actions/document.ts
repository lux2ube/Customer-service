
'use server';

import { z } from 'zod';
import { createWorker } from 'tesseract.js';
import path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  data?: {
    rawText: string;
  };
} | undefined;


const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});


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
    // Explicitly define the path to the language data files.
    // This is crucial for server-side execution where network requests might fail.
    const tessDataPath = path.join(process.cwd(), 'node_modules', 'tesseract.js-core', 'tessdata');

    worker = await createWorker('ara+eng', 1, {
      langPath: tessDataPath,
      gzip: false,
    });
    
    // Perform OCR to get all text at once
    const { data: { text } } = await worker.recognize(imageBuffer);
    
    // Terminate the worker to free up resources
    await worker.terminate();

    if (!text || text.trim().length === 0) {
        return {
            error: true,
            message: "Could not extract any text from the image. It might be blank or too blurry."
        };
    }

    // Return the raw text directly without parsing
    return { success: true, data: { rawText: text }};

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
