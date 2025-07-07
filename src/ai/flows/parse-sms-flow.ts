'use server';
/**
 * @fileOverview An AI flow for parsing financial transaction SMS messages.
 *
 * - parseSms - A function that uses an AI model to parse an SMS string.
 * - SmsParseInput - The input type for the parseSms function.
 * - ParsedSmsOutput - The return type for the parseSms function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const SmsParseInputSchema = z.string().describe("The raw SMS message content.");
export type SmsParseInput = z.infer<typeof SmsParseInputSchema>;

export const ParsedSmsOutputSchema = z.object({
  type: z.enum(['credit', 'debit', 'unknown']).describe("The type of transaction. 'credit' is a deposit, 'debit' is a withdrawal."),
  amount: z.number().nullable().describe("The numeric amount of the transaction."),
  currency: z.string().nullable().describe("The currency code (e.g., YER, SAR, USD)."),
  person: z.string().nullable().describe("The name of the other person involved in the transaction."),
});
export type ParsedSmsOutput = z.infer<typeof ParsedSmsOutputSchema>;

export async function parseSms(input: SmsParseInput): Promise<ParsedSmsOutput> {
  return parseSmsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'parseSmsPrompt',
  input: { schema: SmsParseInputSchema },
  output: { schema: ParsedSmsOutputSchema },
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
