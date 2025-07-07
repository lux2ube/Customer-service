'use server';
/**
 * @fileOverview An AI flow for parsing financial transaction SMS messages.
 *
 * - parseSms - A function that uses an AI model to parse an SMS string.
 * - SmsParseInput - The input type for the parseSms function.
 * - ParsedSmsOutput - The return type for the parseSms function.
 */

import { ai } from '@/ai/genkit';
import { 
    SmsParseInputSchema, 
    ParsedSmsOutputSchema,
    type SmsParseInput,
    type ParsedSmsOutput
} from '@/lib/types';

// Re-exporting types is allowed in "use server" files.
export type { SmsParseInput, ParsedSmsOutput };

export async function parseSms(input: SmsParseInput): Promise<ParsedSmsOutput> {
  return parseSmsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseSmsPrompt',
  input: { schema: SmsParseInputSchema },
  output: { schema: ParsedSmsOutputSchema },
  history: [
    {
        input: 'أودع/محمد احمد لحسابك35000 YERرصيدك181688٫9YER',
        output: {
            type: 'credit',
            amount: 35000,
            currency: 'YER',
            person: 'محمد احمد',
        }
    },
    {
        input: 'تم تحويل مبلغ 500.00 ر.س. إلى فهد الغامدي',
        output: {
            type: 'debit',
            amount: 500,
            currency: 'SAR',
            person: 'فهد الغامدي',
        }
    },
    {
        input: 'استلمت 100 USD من شركة الأمل للصرافة. شكرا لاستخدامكم خدماتنا.',
        output: {
            type: 'credit',
            amount: 100,
            currency: 'USD',
            person: 'شركة الأمل للصرافة',
        }
    },
     {
        input: 'تم إيداع 25000 ريال يمني الى حسابك من طرف علي عبدالله صالح. الرصيد الحالي 50000 ريال',
        output: {
            type: 'credit',
            amount: 25000,
            currency: 'YER',
            person: 'علي عبدالله صالح',
        }
    }
  ],
  prompt: `You are an expert financial transaction parser for SMS messages. The messages are in Arabic. Your task is to analyze the following SMS and extract the required information with high accuracy.

  - The transaction 'type' should be 'credit' if it represents a deposit or money received (e.g., "أودع", "استلمت", "إضافة").
  - The transaction 'type' should be 'debit' if it represents a withdrawal or money sent (e.g., "حولت", "تحويل").
  - The 'amount' should be the numerical value of the transaction.
  - The 'currency' should be the currency code (e.g., YER, SAR, USD). If no currency is specified, infer it from the context if possible, otherwise return null.
  - The 'person' is the name of the other party involved in the transaction.
  - If you cannot reliably determine any piece of information, return null for that specific field. If the message does not appear to be a financial transaction, set the type to 'unknown'.

  SMS to parse:
  {{{prompt}}}
  `,
});

const parseSmsFlow = ai.defineFlow(
  {
    name: 'parseSmsFlow',
    inputSchema: SmsParseInputSchema,
    outputSchema: ParsedSmsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
