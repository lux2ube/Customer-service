
'use server';
/**
 * @fileOverview An AI agent for extracting structured information from an image of an identity document.
 * 
 * - extractIdInfo - A function that takes an image data URI and returns structured data.
 * - ExtractIdInfoInput - The input type for the extractIdInfo function.
 * - ExtractedIdInfo - The return type for the extractIdInfo function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

const ExtractIdInfoInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "A photo of an identity document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractIdInfoInput = z.infer<typeof ExtractIdInfoInputSchema>;

const ExtractedIdInfoSchema = z.object({
  isIdDocument: z.boolean().describe('Set to true if the text appears to be from an official ID card or passport, false otherwise.'),
  fullName: z.string().optional().describe('The full name of the person as written on the document.'),
  idNumber: z.string().optional().describe('The national ID number or document number.'),
  dateOfBirth: z.string().optional().describe('The date of birth in YYYY-MM-DD format.'),
  dateOfIssue: z.string().optional().describe('The date the document was issued in YYYY-MM-DD format.'),
  dateOfExpiry: z.string().optional().describe('The date the document expires in YYYY-MM-DD format. Can be "N/A" if not present.'),
  placeOfBirth: z.string().optional().describe('The place of birth as written on the document.'),
  error: z.string().optional().describe("If you cannot process the text, provide a reason here (e.g., 'Text is not from an ID card')."),
});
export type ExtractedIdInfo = z.infer<typeof ExtractedIdInfoSchema>;


const prompt = ai.definePrompt({
    name: 'extractIdInfoPrompt',
    model: googleAI.model('gemini-1.5-flash-preview'),
    input: { schema: ExtractIdInfoInputSchema },
    output: { schema: ExtractedIdInfoSchema },
    prompt: `You are an expert in parsing Arabic identity documents, specifically from Yemen, directly from an image. Your task is to perform OCR on the image and then extract structured information from the recognized text.

Analyze the following image and extract the required fields. Be resilient to OCR mistakes, image quality issues, and variations in document layout.

Image:
{{media url=imageDataUri}}

Instructions:
- First, perform OCR on the image to get all the Arabic text.
- Then, analyze the extracted text. Look for keywords like 'الاسم' for the name, 'الرقم الوطني' for the ID number, 'تاريخ الميلاد' for date of birth, etc.
- Dates might be in Hijri or Gregorian format; normalize them to YYYY-MM-DD.
- If the image does not seem to contain an ID card or passport at all, set 'isIdDocument' to false and provide a reason in the 'error' field.
- Do your best to find all the data points even if the text is messy.
- Only return the structured JSON data.
`
});

export const extractIdInfoFlow = ai.defineFlow(
    {
        name: 'extractIdInfoFlow',
        inputSchema: ExtractIdInfoInputSchema,
        outputSchema: ExtractedIdInfoSchema,
    },
    async (input) => {
        const { output } = await prompt(input);
        return output!;
    }
);

export async function extractIdInfo(input: ExtractIdInfoInput): Promise<ExtractedIdInfo> {
    return extractIdInfoFlow(input);
}
