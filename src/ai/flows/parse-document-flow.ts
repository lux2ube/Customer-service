'use server';
/**
 * @fileOverview An AI agent for parsing Yemeni identity documents.
 *
 * - parseDocument - A function that handles the document parsing process.
 * - ParseDocumentInput - The input type for the parseDocument function.
 * - ParseDocumentOutput - The return type for the parseDocument function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const ParseDocumentInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseDocumentInput = z.infer<typeof ParseDocumentInputSchema>;


const NationalIdDetailsSchema = z.object({
    documentType: z.literal('national_id'),
    name: z.string().optional().describe('The full name in Arabic.'),
    idNumber: z.string().optional().describe('The national ID number.'),
    birthDate: z.string().optional().describe('The date of birth, formatted as YYYY/MM/DD.'),
    birthPlace: z.string().optional().describe('The place of birth in Arabic.'),
});

const PassportDetailsSchema = z.object({
    documentType: z.literal('passport'),
    passportNumber: z.string().optional().describe('The passport number.'),
    fullName: z.string().optional().describe('The full name in English (Given Names + Surname).'),
    nationality: z.string().optional().describe('The 3-letter country code for nationality.'),
    birthDate: z.string().optional().describe('The date of birth from the main section or MRZ, formatted as YYYY/MM/DD.'),
    expiryDate: z.string().optional().describe('The expiry date from the main section or MRZ, formatted as YYYY/MM/DD.'),
    sex: z.string().optional().describe('The sex (M/F).'),
});

const UnknownDetailsSchema = z.object({
    documentType: z.literal('unknown'),
});

export const ParseDocumentOutputSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'unknown']).describe('The type of document identified.'),
  details: z.union([NationalIdDetailsSchema, PassportDetailsSchema, UnknownDetailsSchema]).optional(),
});
export type ParseDocumentOutput = z.infer<typeof ParseDocumentOutputSchema>;


export async function parseDocument(input: ParseDocumentInput): Promise<ParseDocumentOutput> {
  return parseDocumentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseDocumentPrompt',
  input: { schema: ParseDocumentInputSchema },
  output: { schema: ParseDocumentOutputSchema },
  model: 'gemini-1.5-flash-preview',
  prompt: `You are an expert document analysis system specializing in Yemeni identity documents. Your task is to analyze the provided image and extract key information.

Analyze the image: {{media url=photoDataUri}}

Instructions:
1.  First, determine the document type. It can be a Yemeni National ID ('national_id'), a Yemeni Passport ('passport'), or 'unknown'.
2.  Based on the document type, extract the following fields and return them in the 'details' object.
3.  If the document is a Yemeni National ID, extract:
    - name: The full name in Arabic.
    - idNumber: The national ID number.
    - birthDate: The date of birth.
    - birthPlace: The place of birth.
4.  If the document is a Yemeni Passport, extract:
    - passportNumber: The passport number.
    - fullName: The full name in English (combine GIVEN NAMES and SURNAME).
    - nationality: The 3-letter country code.
    - birthDate: The date of birth. Use the MRZ (Machine-Readable Zone) if available as it is more reliable.
    - expiryDate: The date of expiry. Use the MRZ if available.
    - sex: The sex (M or F).
5.  All dates must be standardized to YYYY/MM/DD format. For example, '29/07/1987' becomes '1987/07/29'.
6.  If the document type cannot be identified or if required fields are missing, set the documentType to 'unknown' and do not return a details object.
7.  Provide your response exclusively in the format of the JSON schema.`,
});

const parseDocumentFlow = ai.defineFlow(
  {
    name: 'parseDocumentFlow',
    inputSchema: ParseDocumentInputSchema,
    outputSchema: ParseDocumentOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      return { documentType: 'unknown' };
    }
    return output;
  }
);
