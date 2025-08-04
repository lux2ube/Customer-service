'use server';

import { z } from 'zod';
import { parseDocument, type ParseDocumentOutput } from '@/ai/flows/parse-document-flow';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  data?: ParseDocumentOutput;
} | undefined;


const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 5MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});


async function fileToDataUri(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return `data:${file.type};base64,${buffer.toString('base64')}`;
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
    const photoDataUri = await fileToDataUri(documentImage);

    const result = await parseDocument({ photoDataUri });
    
    if (result.documentType === 'unknown' || !result.isClear) {
        return {
            error: true,
            message: "Could not identify the document type or the image was not clear enough to read.",
        };
    }

    return { success: true, data: result };

  } catch (error: any) {
    console.error("Document processing error:", error);
    return {
      error: true,
      message: error.message || 'An unexpected error occurred while processing the document.',
    };
  }
}
