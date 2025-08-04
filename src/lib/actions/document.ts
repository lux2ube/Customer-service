'use server';

import { z } from 'zod';
import { db, storage } from '../firebase';
import { get, ref } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { v4 as uuidv4 } from 'uuid';
import type { Settings } from '../types';
import { parseDocumentText, type ParseDocumentOutput } from '@/ai/flows/parse-document-flow';

const OcrSpaceResponseSchema = z.object({
  ParsedResults: z.array(z.object({
    ParsedText: z.string(),
    ErrorMessage: z.string().optional(),
    ErrorDetails: z.string().optional(),
  })).optional(),
  OCRExitCode: z.number(),
  IsErroredOnProcessing: z.boolean(),
  ErrorMessage: z.union([z.string(), z.array(z.string())]).optional(),
  ErrorDetails: z.string().optional(),
});

export type DocumentParsingState = {
  success?: boolean;
  error?: boolean;
  message?: string;
  rawText?: string;
  parsedData?: ParseDocumentOutput;
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
  
  // Step 1: Upload image to get a public URL for the OCR service
  let publicUrl = '';
  try {
    const fileExtension = documentImage.name.split('.').pop();
    const uniqueFilename = `${uuidv4()}.${fileExtension}`;
    const fileRef = storageRef(storage, `ocr_uploads/${uniqueFilename}`);
    
    await uploadBytes(fileRef, documentImage);
    publicUrl = await getDownloadURL(fileRef);
  } catch (error: any) {
    console.error("Firebase Storage Upload Error:", error);
    let userMessage = 'Failed to upload image to storage.';
    if (error.code === 'storage/unauthorized') {
        userMessage = 'Upload failed due to permissions. Please update your Firebase Storage Rules to allow public writes to the `ocr_uploads/` path.';
    }
    return { error: true, message: userMessage };
  }

  // Step 2: Call OCR.space API to get raw text
  let rawText = '';
  try {
    const ocrFormData = new URLSearchParams();
    ocrFormData.append('apikey', 'K87110746488957');
    ocrFormData.append('url', publicUrl);
    ocrFormData.append('language', 'ara');
    ocrFormData.append('isOverlayRequired', 'false');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: ocrFormData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("OCR API Error Response:", errorText);
        return { error: true, message: `OCR API request failed with status: ${response.status}.` };
    }

    const result = await response.json();
    const parsedResult = OcrSpaceResponseSchema.safeParse(result);

    if (!parsedResult.success || parsedResult.data.IsErroredOnProcessing || !parsedResult.data.ParsedResults) {
      const apiError = Array.isArray(parsedResult.data?.ErrorMessage) ? parsedResult.data.ErrorMessage.join(', ') : parsedResult.data.ErrorMessage;
      console.error("OCR API Processing Error:", apiError || parsedResult.data?.ErrorDetails);
      return { error: true, message: apiError || 'Failed to process image with OCR API.' };
    }
    
    rawText = parsedResult.data.ParsedResults[0]?.ParsedText || '';

    if (!rawText) {
        return { error: true, message: 'OCR process completed, but no text was extracted.' };
    }

  } catch (error: any) {
    console.error("OCR API Call Error:", error);
    return { error: true, message: error.message || 'An unexpected error occurred during OCR processing.' };
  }

  // Step 3: Call AI to parse the raw text
  try {
    const parsedData = await parseDocumentText({ rawText });
    return {
      success: true,
      rawText: rawText,
      parsedData: parsedData,
    };
  } catch (error: any) {
    console.error("AI Parsing Error:", error);
    return {
      error: true,
      message: error.message || 'An unexpected error occurred during AI parsing.',
      rawText: rawText, // Still return the raw text on parsing failure
    };
  }
}
