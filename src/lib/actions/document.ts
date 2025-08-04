'use server';

import { z } from 'zod';
import { db } from '../firebase';
import { get, ref } from 'firebase/database';
import { parseDocument, ParseDocumentOutputSchema } from '@/ai/flows/parse-document-flow';
import type { Settings } from '../types';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png'];

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  data?: z.infer<typeof ParseDocumentOutputSchema>;
} | undefined;


const DocumentSchema = z.object({
  documentImage: z
    .instanceof(File, { message: 'An image file is required.' })
    .refine((file) => file.size > 0, 'File cannot be empty.')
    .refine((file) => file.size <= MAX_FILE_SIZE, `File size must be less than 10MB.`)
    .refine((file) => ALLOWED_FILE_TYPES.includes(file.type), 'Only .jpg and .png files are allowed.'),
});

const toDataUri = async (file: File): Promise<string> => {
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
  
  const settingsSnapshot = await get(ref(db, 'settings'));
  const settings: Settings = settingsSnapshot.val();
  
  if (!settings?.gemini_api_key) {
      return {
          error: true,
          message: "Gemini API key is not configured in the main settings. Please add it to enable document processing.",
      }
  }

  const { documentImage } = validatedFields.data;
  
  try {
    const photoDataUri = await toDataUri(documentImage);
    const result = await parseDocument({ photoDataUri });
    
    return {
        success: true,
        data: result
    };

  } catch (error: any) {
    console.error("Document processing error:", error);
    return {
      error: true,
      message: error.message || 'An unexpected error occurred during AI processing.',
    };
  }
}
