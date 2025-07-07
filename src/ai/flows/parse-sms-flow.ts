
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

- **نوع المعاملة (type):**
  - إذا كانت الرسالة تشير إلى إيداع أو استلام أموال، استخدم 'credit'. ابحث عن كلمات مثل "أودع"، "استلمت"، "إضافة"، "إيداع".
  - إذا كانت الرسالة تشير إلى سحب أو إرسال أموال، استخدم 'debit'. ابحث عن كلمات مثل "حولت"، "تحويل".
  - إذا لم تكن معاملة مالية، استخدم 'unknown'.

- **المبلغ (amount):** استخرج القيمة الرقمية للمعاملة. قد تكون الأرقام متصلة بالكلمات.

- **العملة (currency):** استخرج رمز العملة (مثل YER, SAR, USD). إذا لم يتم تحديد العملة بوضوح، حاول استنتاجها من السياق (مثلاً "ر.س." تعني SAR). إذا لم تتمكن، استخدم null.

- **الشخص (person):** استخرج اسم الشخص أو الجهة الأخرى في المعاملة. قد يكون الاسم بعد كلمات مثل "من طرف" أو "إلى" أو مباشرة بعد كلمة "أودع/" أو "لحساب".

- **قواعد هامة:**
  - قم دائمًا بإرجاع كائن JSON يلتزم تمامًا بمخطط الإخراج المحدد.
  - إذا لم تتمكن من تحديد أي معلومة بشكل موثوق، فاستخدم القيمة null للحقل المحدد.
  - انتبه جيدًا للحالات التي تكون فيها الأرقام والكلمات متصلة ببعضها البعض بدون مسافات.

الرسالة لتحليلها:
${input.prompt}
`,
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
