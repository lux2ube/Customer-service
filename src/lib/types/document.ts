import { z } from 'zod';

const NationalIdSchema = z.object({
  name: z.string().optional().describe('The full name of the person in Arabic.'),
  idNumber: z.string().optional().describe('The national ID number.'),
  birthDate: z
    .string()
    .optional()
    .describe('The date of birth, formatted as YYYY/MM/DD.'),
  birthPlace: z.string().optional().describe('The place of birth in Arabic.'),
  maritalStatus: z.string().optional().describe('The marital status in Arabic.'),
});

const PassportSchema = z.object({
  passportNumber: z.string().optional().describe('The passport number.'),
  fullName: z
    .string()
    .optional()
    .describe('The full name in English (Surname and Given Names).'),
  nationality: z
    .string()
    .optional()
    .describe('The 3-letter country code for nationality (e.g., YEM).'),
  dateOfBirth: z
    .string()
    .optional()
    .describe('The date of birth, formatted as DD/MM/YYYY.'),
  expiryDate: z
    .string()
    .optional()
    .describe('The date of expiry, formatted as DD/MM/YYYY.'),
  sex: z.string().optional().describe('The sex (M or F).'),
  issuingAuthority: z.string().optional().describe('The issuing authority.'),
  placeOfBirth: z.string().optional().describe('The place of birth in English.'),
});

export const ParseDocumentOutputSchema = z.object({
  documentType: z
    .enum(['national_id', 'passport', 'unknown'])
    .describe('The type of document identified.'),
  details: z
    .union([NationalIdSchema, PassportSchema])
    .optional()
    .describe(
      "The extracted details. This will be empty if the document type is unknown."
    ),
});
export type ParseDocumentOutput = z.infer<typeof ParseDocumentOutputSchema>;

export const ParseDocumentInputSchema = z.object({
  rawText: z
    .string()
    .describe('The raw text extracted from the document via OCR.'),
});
export type ParseDocumentInput = z.infer<typeof ParseDocumentInputSchema>;
