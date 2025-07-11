
'use server';
/**
 * @fileOverview An AI agent for extracting structured information from OCR text of identity documents.
 * 
 * - extractIdInfo - A function that takes raw text and returns structured data.
 * - ExtractIdInfoInput - The input type for the extractIdInfo function.
 * - ExtractedIdInfo - The return type for the extractIdInfo function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const ExtractIdInfoInputSchema = z.object({
  rawOcrText: z.string().describe('The raw, unstructured text extracted from an ID document using OCR.'),
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
    input: { schema: ExtractIdInfoInputSchema },
    output: { schema: ExtractedIdInfoSchema },
    prompt: `You are an expert in parsing Arabic identity documents, specifically from Yemen. Your task is to extract structured information from the provided raw OCR text. The text may be messy and contain errors.

Analyze the following text and extract the required fields. Be resilient to OCR mistakes, such as swapped characters or misread words. If a field is not present, omit it.

Raw Text:
{{{rawOcrText}}}

Instructions:
- Look for keywords like 'الاسم' for the name, 'الرقم الوطني' for the ID number, 'تاريخ الميلاد' for date of birth, etc.
- Dates might be in different formats; normalize them to YYYY-MM-DD.
- If the text does not seem to be from an ID card or passport at all, set 'isIdDocument' to false and provide a reason in the 'error' field.
- Do your best to find all the data points.
`
});

const extractIdInfoFlow = ai.defineFlow(
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
