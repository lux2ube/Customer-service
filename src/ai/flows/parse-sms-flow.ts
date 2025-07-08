'use server';

import { genkit, GenkitError } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';
import type { ParsedSms } from '@/lib/types';

// Define the schema for the expected AI output
const ParsedSmsSchema = z.object({
  parsed: z.boolean().describe("Set to true if parsing was successful, false otherwise."),
  type: z.enum(['credit', 'debit']).optional().describe("The transaction type. 'credit' for deposits/receiving, 'debit' for withdrawals/sending."),
  amount: z.number().optional().describe("The transaction amount as a number."),
  person: z.string().optional().describe("The name of the other person/entity in the transaction."),
});

const prompt = `أنت خبير في تحليل رسائل SMS المالية باللغة العربية. مهمتك هي استخراج التفاصيل من الرسالة التالية.

الرسالة:
"{{{smsBody}}}"

التعليمات:
1.  حدد نوع العملية:
    - إذا كانت الرسالة تحتوي على كلمات مثل "أودع", "استلمت", "إضافة", "اضيف", "لحسابك", "وصل", فهذه عملية "credit" (إيداع).
    - إذا كانت الرسالة تحتوي على كلمات مثل "حولت", "تم تحويل", "خصم", "سحب", فهذه عملية "debit" (سحب).
2.  استخرج المبلغ (amount) كرقم فقط. تجاهل الفواصل.
3.  استخرج اسم الشخص الآخر في المعاملة (person). قد يأتي الاسم بعد كلمات مثل "من", "لـ", "لحساب", "إلى", أو قد يكون في بداية الجملة مثل "أودع/". في بعض الأحيان يكون الشخص عبارة عن رقم هاتف مثل "جوالي رقم 733969608".
4.  إذا لم تتمكن من تحديد أي من هذه التفاصيل بشكل مؤكد، أو إذا كانت الرسالة لا تبدو كمعاملة مالية، أعد كائن JSON مع {"parsed": false}.
5.  يجب أن يكون الرد الخاص بك بتنسيق JSON حصريًا، مطابقًا للمخطط المحدد.

أمثلة لفهمك:
- "تم تحويل10100لحساب عمار محمد رصيدك14٫83YER" -> {"parsed": true, "type": "debit", "amount": 10100, "person": "عمار محمد"}
- "أودع/محمد احمد لحسابك35000 YER" -> {"parsed": true, "type": "credit", "amount": 35000, "person": "محمد احمد"}
- "استلمت 6,000.00 من صدام حسن احمد" -> {"parsed": true, "type": "credit", "amount": 6000, "person": "صدام حسن احمد"}
- "خصم 53750ر.ي تحويل لمحفظة/بنك ... الى جوالي رقم 733969608" -> {"parsed": true, "type": "debit", "amount": 53750, "person": "جوالي رقم 733969608"}
- "مرحبا بك في عالمنا" -> {"parsed": false}
`;

export async function parseSmsWithAi(smsBody: string, apiKey: string): Promise<ParsedSms | null> {
    if (!apiKey) {
        console.error("AI Parser: Gemini API key is missing.");
        return null;
    }

    try {
        // Configure a temporary Genkit instance with the user's key
        const ai = genkit({
            plugins: [googleAI({ apiKey })],
        });

        const llmResponse = await ai.generate({
            model: 'gemini-1.5-flash-preview',
            prompt: prompt.replace('{{{smsBody}}}', smsBody),
            config: {
                responseMimeType: 'application/json',
                temperature: 0, // We want deterministic output
            },
            output: {
                format: 'json',
                schema: ParsedSmsSchema,
            }
        });

        const parsedJson = llmResponse.output;

        if (!parsedJson || !parsedJson.parsed) {
            console.log(`AI Parser: Failed to parse or rejected SMS: "${smsBody}"`);
            return null;
        }

        // Validate that essential fields are present after successful parsing
        if (!parsedJson.type || !parsedJson.amount || !parsedJson.person) {
            console.log(`AI Parser: Parsed successfully but missing essential fields for SMS: "${smsBody}"`);
            return null;
        }

        console.log(`AI Parser: Successfully parsed SMS: "${smsBody}"`);
        return parsedJson as ParsedSms;

    } catch (error)
    {
        if (error instanceof GenkitError) {
             console.error(`AI Parser GenkitError for SMS: "${smsBody}"`, {
                message: error.message,
                stack: error.stack,
                details: error.details,
            });
        } else {
             console.error(`AI Parser: An unexpected error occurred for SMS: "${smsBody}"`, error);
        }
        return null;
    }
}
