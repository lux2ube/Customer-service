
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
            prompt: `أنت خبير في تحليل رسائل SMS المالية باللغة العربية. مهمتك هي تحليل الرسالة التالية واستخراج المعلومات المطلوبة بدقة عالية.

- يجب أن يكون نوع المعاملة 'type' هو 'credit' إذا كانت تمثل إيداعًا أو استلام أموال (مثل: "أودع"، "استلمت"، "إضافة"، "إيداع").
- يجب أن يكون نوع المعاملة 'type' هو 'debit' إذا كانت تمثل سحبًا أو إرسال أموال (مثل: "حولت"، "تحويل").
- يجب أن تكون 'amount' هي القيمة الرقمية للمعاملة.
- يجب أن تكون 'currency' هي رمز العملة (مثل: YER, SAR, USD). إذا لم يتم تحديد العملة، حاول استنتاجها من السياق، وإلا فاستخدم null.
- يجب أن يكون 'person' هو اسم الطرف الآخر في المعاملة.
- إذا لم تتمكن من تحديد أي معلومة بشكل موثوق، فاستخدم القيمة null للحقل المحدد.
- إذا لم تكن الرسالة معاملة مالية، اضبط النوع 'type' على 'unknown' واجعل جميع الحقول الأخرى null.
- قم دائمًا بإرجاع كائن JSON يلتزم تمامًا بمخطط الإخراج المحدد.

الرسالة لتحليلها:
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
                },
                {
                    role: 'user',
                    content: [{ text: 'تم تحويل10100لحساب عمار محمد رصيدك14٫83YER' }]
                },
                {
                    role: 'model',
                    content: [{
                        data: {
                            type: 'debit',
                            amount: 10100,
                            currency: 'YER',
                            person: 'عمار محمد',
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
