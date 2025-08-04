'use server';
/**
 * @fileOverview An AI flow for parsing text extracted from Yemeni identity documents.
 *
 * - parseDocumentText - A function that handles the document parsing process.
 * - ParseDocumentInput - The input type for the parseDocumentText function.
 * - ParseDocumentOutput - The return type for the parseDocumentText function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const NationalIdSchema = z.object({
  name: z.string().optional().describe('The full name of the person in Arabic.'),
  idNumber: z.string().optional().describe('The national ID number.'),
  birthDate: z.string().optional().describe('The date of birth, formatted as YYYY/MM/DD.'),
  birthPlace: z.string().optional().describe('The place of birth in Arabic.'),
  maritalStatus: z.string().optional().describe('The marital status in Arabic.'),
});

const PassportSchema = z.object({
  passportNumber: z.string().optional().describe('The passport number.'),
  fullName: z.string().optional().describe('The full name in English (Surname and Given Names).'),
  nationality: z.string().optional().describe('The 3-letter country code for nationality (e.g., YEM).'),
  dateOfBirth: z.string().optional().describe('The date of birth, formatted as DD/MM/YYYY.'),
  expiryDate: z.string().optional().describe('The date of expiry, formatted as DD/MM/YYYY.'),
  sex: z.string().optional().describe('The sex (M or F).'),
  issuingAuthority: z.string().optional().describe('The issuing authority.'),
  placeOfBirth: z.string().optional().describe('The place of birth in English.'),
});

export const ParseDocumentOutputSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'unknown']).describe("The type of document identified."),
  details: z.union([NationalIdSchema, PassportSchema]).optional().describe("The extracted details. This will be empty if the document type is unknown."),
});
export type ParseDocumentOutput = z.infer<typeof ParseDocumentOutputSchema>;

export const ParseDocumentInputSchema = z.object({
  rawText: z.string().describe("The raw text extracted from the document via OCR."),
});
export type ParseDocumentInput = z.infer<typeof ParseDocumentInputSchema>;


const prompt = ai.definePrompt({
  name: 'parseDocumentPrompt',
  input: { schema: ParseDocumentInputSchema },
  output: { schema: ParseDocumentOutputSchema },
  model: 'googleai/gemini-1.5-flash-preview',
  prompt: `You are an expert in parsing documents, specifically Yemeni National IDs and Passports, from raw OCR text. Analyze the following text and extract the required information into a structured JSON format.

The text may contain errors and mixed languages (Arabic and English). Be resilient to these errors.

Raw Text:
---
{{{rawText}}}
---

Instructions:
1.  First, determine the document type. Look for keywords.
    - If you see "الجمهورية اليمنية" and "بطاقة شخصية", it is a 'national_id'.
    - If you see "PASSPORT" and "REPUBLIC OF YEMEN", it is a 'passport'.
    - If neither, set the type to 'unknown'.
2.  Based on the document type, extract the following fields. If a field is not found, omit it.

    **If National ID:**
    - name: The full Arabic name, usually next to "الاسم".
    - idNumber: The long number, usually next to "الرقم الوطني".
    - birthDate: Find the date next to "تاريخ الميلاد". Format it as YYYY/MM/DD.
    - birthPlace: Find the text next to "محل الميلاد".
    - maritalStatus: Find the text next to "الحالة الاجتماعية".

    **If Passport:**
    - passportNumber: The number next to "PASSPORT No".
    - fullName: Combine the "SURNAME" and "GIVEN NAMES" fields.
    - nationality: The 3-letter code next to "COUNTRY CODE".
    - dateOfBirth: Find the date next to "DATE OF BIRTH". Format it as DD/MM/YYYY.
    - expiryDate: Find the date next to "DATE OF EXPIRY". Format it as DD/MM/YYYY.
    - sex: The single letter (M/F) next to "SEX".
    - issuingAuthority: The text next to "ISSUING AUTHORITY".
    - placeOfBirth: The text next to "PLACE OF BIRTH".

3.  Return the final JSON object. For 'unknown' types, the 'details' field should be omitted.
`,
});

const parseDocumentFlow = ai.defineFlow(
    {
      name: 'parseDocumentFlow',
      inputSchema: ParseDocumentInputSchema,
      outputSchema: ParseDocumentOutputSchema,
    },
    async (input) => {
      const { output } = await prompt(input);
      return output!;
    }
);

export async function parseDocumentText(input: ParseDocumentInput): Promise<ParseDocumentOutput> {
  return parseDocumentFlow(input);
}
