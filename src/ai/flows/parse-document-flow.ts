'use server';
/**
 * @fileOverview An AI flow for parsing Yemeni identity documents.
 * 
 * - parseDocument - A function that handles the document parsing process.
 * - ParseDocumentInput - The input type for the parseDocument function.
 * - ParseDocumentOutput - The return type for the parseDocument function.
 */

import { ai } from '@/ai/genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

const ParseDocumentInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a document (Yemeni National ID or Passport), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ParseDocumentInput = z.infer<typeof ParseDocumentInputSchema>;


const NationalIdSchema = z.object({
  name: z.string().describe("The full name in Arabic."),
  idNumber: z.string().describe("The national ID number."),
  birthDate: z.string().describe("The date of birth (DD/MM/YYYY)."),
  birthPlace: z.string().describe("The place of birth (governorate and district)."),
  issueDate: z.string().describe("The date the ID was issued (DD/MM/YYYY)."),
});

const PassportSchema = z.object({
  passportNumber: z.string().describe("The passport number."),
  fullName: z.string().describe("The full name in English, as written on the passport."),
  nationality: z.string().describe("The nationality (e.g., YEMENI)."),
  dateOfBirth: z.string().describe("The date of birth (DD MMM YYYY)."),
  dateOfExpiry: z.string().describe("The expiry date (DD MMM YYYY)."),
  mrzLine1: z.string().optional().describe("The first line of the Machine Readable Zone (MRZ)."),
  mrzLine2: z.string().optional().describe("The second line of the Machine Readable Zone (MRZ)."),
});


const ParseDocumentOutputSchema = z.object({
  documentType: z.enum(['national_id', 'passport', 'unknown']).describe("The type of document identified."),
  isClear: z.boolean().describe("Whether the document image is clear and legible."),
  details: z.union([NationalIdSchema, PassportSchema, z.object({})]).describe("The extracted details, structured according to the document type. Returns an empty object if the type is unknown or unclear."),
});
export type ParseDocumentOutput = z.infer<typeof ParseDocumentOutputSchema>;


export async function parseDocument(input: ParseDocumentInput): Promise<ParseDocumentOutput> {
  return parseDocumentFlow(input);
}


const prompt = ai.definePrompt({
  name: 'parseDocumentPrompt',
  model: googleAI.model('gemini-1.5-flash-preview'),
  input: { schema: ParseDocumentInputSchema },
  output: { schema: ParseDocumentOutputSchema },
  prompt: `You are an expert document processing agent specializing in Yemeni identity documents.
Your task is to analyze the provided image and extract key information.

First, determine the document type. It can only be one of 'national_id' (بطاقة شخصية يمنية) or 'passport' (جواز سفر يمني).
If the document is not one of these, or if the image is completely illegible or not a document, set documentType to 'unknown' and isClear to false.

If the document is clear, set isClear to true and extract the following information based on the document type into the 'details' object.

**For a Yemeni National ID (بطاقة شخصية):**
- name: The full Arabic name (الاسم).
- idNumber: The national ID number (الرقم الوطني).
- birthDate: The date of birth (تاريخ الميلاد).
- birthPlace: The place of birth (محل الميلاد).
- issueDate: The date the ID was issued (تاريخ الإصدار).

**For a Yemeni Passport (جواز سفر):**
- passportNumber: The passport number.
- fullName: The full name in English.
- nationality: The nationality.
- dateOfBirth: The date of birth.
- dateOfExpiry: The date of expiry.
- mrzLine1: The first line of the Machine Readable Zone (MRZ) at the bottom.
- mrzLine2: The second line of the Machine Readable Zone (MRZ) at the bottom.

Analyze the image carefully. Pay close attention to both Arabic and English text. For dates, return them in the format seen on the document.
If a field is not present or is unreadable, omit it from the response.

Image to analyze: {{media url=photoDataUri}}
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
    if (!output) {
      throw new Error("The model failed to return a valid structured output.");
    }
    return output;
  }
);
