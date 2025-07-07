
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

const parseSmsFlow = ai.defineFlow(
  {
    name: 'parseSmsFlow',
    inputSchema: SmsParseInputSchema,
    outputSchema: ParsedSmsOutputSchema,
  },
  async (input) => {
    if (!input.apiKey) {
        console.error("Gemini API key was not provided to the flow. SMS parsing will be skipped.");
        return {
            type: 'unknown',
            amount: null,
            currency: null,
            person: null,
        };
    }
    
    try {
        const { output } = await ai.generate({
            model: 'googleai/gemini-pro',
            prompt: `You are an expert financial transaction parser for SMS messages. The messages are in Arabic. Your task is to analyze the following SMS and extract the required information with high accuracy.

- The transaction 'type' should be 'credit' if it represents a deposit or money received (e.g., "أودع", "استلمت", "إضافة", "إيداع").
- The transaction 'type' should be 'debit' if it represents a withdrawal or money sent (e.g., "حولت", "تحويل").
- The 'amount' should be the numerical value of the transaction.
- The 'currency' should be the currency code (e.g., YER, SAR, USD). If no currency is specified, infer it from the context if possible, otherwise return null.
- The 'person' is the name of the other party involved in the transaction.
- If you cannot reliably determine any piece of information, return null for that specific field. 
- If the message does not appear to be a financial transaction, set all fields to null and the type to 'unknown'.
- Always return a JSON object that strictly adheres to the provided output schema.

SMS to parse:
${input.prompt}
`,
            history: [
                {
                    role: 'user',
                    content: [{ text: 'أودع/عبدالله عبدالغفور لحسابك2500 YERرصيدك146688٫9YER' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'credit',
                            amount: 2500,
                            currency: 'YER',
                            person: 'عبدالله عبدالغفور',
                        }
                    }]
                },
                {
                    role: 'user',
                    content: [{ text: 'أودع/محمد احمد لحسابك35000 YERرصيدك181688٫9YER' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'credit',
                            amount: 35000,
                            currency: 'YER',
                            person: 'محمد احمد',
                        }
                    }]
                },
                {
                    role: 'user',
                    content: [{ text: 'تم تحويل مبلغ 500.00 ر.س. إلى فهد الغامدي' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'debit',
                            amount: 500,
                            currency: 'SAR',
                            person: 'فهد الغامدي',
                        }
                    }]
                },
                {
                    role: 'user',
                    content: [{ text: 'استلمت 100 USD من شركة الأمل للصرافة. شكرا لاستخدامكم خدماتنا.' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'credit',
                            amount: 100,
                            currency: 'USD',
                            person: 'شركة الأمل للصرافة',
                        }
                    }]
                },
                {
                    role: 'user',
                    content: [{ text: 'تم إيداع 25000 ريال يمني الى حسابك من طرف علي عبدالله صالح. الرصيد الحالي 50000 ريال' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'credit',
                            amount: 25000,
                            currency: 'YER',
                            person: 'علي عبدالله صالح',
                        }
                    }]
                }
            ],
            config: {
                apiKey: input.apiKey,
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                ],
            },
            output: {
                format: 'json',
                schema: ParsedSmsOutputSchema,
            },
        });

        if (output) {
            return output;
        }
    } catch(e) {
        console.error("Error during AI generation in parseSmsFlow:", e);
    }
    
    // If anything fails, return a default 'unknown' object.
    return {
        type: 'unknown',
        amount: null,
        currency: null,
        person: null,
    };
  }
);
