'use server';
/**
 * @fileOverview An AI flow for parsing text extracted from Yemeni identity documents.
 *
 * This file contains the Genkit flow that communicates with the AI model
 * to parse document text.
 */

import { ai } from '@/ai/genkit';
import {
  ParseDocumentInputSchema,
  ParseDocumentOutputSchema,
  type ParseDocumentInput,
  type ParseDocumentOutput,
} from '@/lib/types/document';

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

export async function parseDocumentText(
  input: ParseDocumentInput
): Promise<ParseDocumentOutput> {
  return parseDocumentFlow(input);
}
