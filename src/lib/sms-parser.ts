
import type { ParsedSms } from '@/lib/types';

// A list of parser configurations, ordered by priority.
// Each parser has a regex and a map to extract data.
// These have been made more flexible to handle RTL/LTR word reordering.
const parsers = [
    // --- CREDIT (IDIF/ADIFA) ---
    // NEW: Handles "تم√√إضافة" format with unreliable word ordering due to RTL/LTR mixing.
    // It uses lookaheads to find all parts, regardless of order, then captures them.
    {
        name: 'Credit (Tam Idafa) with checkmarks (Robust)',
        regex: /^(?=.*تم\s*√{1,2}\s*إضافة)(?=.*من\s*(.*?)\s*رصيدك).*?([\d,٫.]+)/,
        map: { type: 'credit', person: 1, amount: 2 }
    },
    {
        name: 'Credit (Idif) conjoined currency from person',
        regex: /اضيف ([\d,٫.]+)ر\.[س|ي] تحويل مشترك رص:.*? من (.*)/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Idif) from person with "mogabel"',
        regex: /اضيف ([\d,٫.]+)ر\.ي مقابل تحويل مشترك رص:.*? من (.*)/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Idif) from Mobile Money',
        regex: /اضيف ([\d,٫.]+)ر\.ي مقابل تحويل من محفظة\/بنك رص:.*? من (موبايل موني رقم \d+)/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Idif) for Hawala exchange',
        regex: /اضيف ([\d,٫.]+)ر\.ي مقابل صرف حوالة الى المحفظة رص:.*? من (.*)/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Idif) from person with optional phone',
        regex: /اضيف ([\d,٫.]+)р\.ي تحويل مشترك رص:.*? من (.*?)(?:-\d+)?/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Tam Idaa) YER',
        regex: /تم ايداع ([\d,٫.]+)\s*.*? لحسابكم المرسل (.*?) الرصيد/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    // --- DEBIT (KHASM) ---
    {
        name: 'Debit (Khasm) Hazmi Transfer',
        regex: /خصم ([\d,٫.]+)ر\.[س|ي] مقابل إرسال حوالة حزمي تحويل رص:.*? الى (.*)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Khasm) YER Local Transfer',
        regex: /خصم ([\d,٫.]+)ر\.ي مقابل إرسال حوالة محلية رص:.*? الى (.*)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Khasm) YER to Kash number',
        regex: /خصم ([\d,٫.]+)ر\.ي مقابل تحويل لمحفظة\/بنك رص:.*? الى (كاش رقم \d+)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Khasm) YER to phone number with balance',
        regex: /خصم ([\d,٫.]+)ر\.ي تحويل لمحفظة\/بنك رص:.*? الى (.*)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Khasm) from ATM - YKB',
        regex: /خصم ([\d,٫.]+)ر\.ي سحب من الصراف الآلي YKB رص:/,
        map: { type: 'debit', amount: 1, person: 'YKB ATM' }
    },
    {
        name: 'Debit (Khasm) cash withdrawal SAR - no space',
        regex: /خصم ([\d,٫.]+)ر\.س سحب نقدي رص:/,
        map: { type: 'debit', amount: 1, person: 'Cash Withdrawal' }
    },
    {
        name: 'Debit (Khasm) from ATM',
        regex: /خصم ([\d,٫.]+)ر\.ي سحب من (.*?) رص:/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Tam Khasm) for purchases',
        regex: /تم خصم ([\d,٫.]+) من حسابك مقابل مشترياتك من (.*?) رصيدك/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    
    // --- DEBIT (TAM) ---
    {
        name: 'Debit (Tam Tahweel) without spaces',
        regex: /تم تحويل\s*([\d,٫.]+)\s*لحساب (.*?) رصيدك/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Tam Sahab) YER via Haseb',
        regex: /تم سحب ([\d,٫.]+) رصيدك .*?عبر (حاسب ادفع قيمة مشترياتك بسهولة)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Tam Sahab) YER',
        regex: /تم سحب المبلغ\s+([\d,٫.]+) رصيدك/,
        map: { type: 'debit', amount: 1, person: 'Self Withdrawal' }
    },
    {
        name: 'Debit (Tam Tahweel) with checkmarks',
        regex: /تم\s*√{1,2}\s*تحويل\s*([\d,٫.]+)\s*.*? لـ\s*(.*?) بنجاح/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Tam Sahab) with checkmarks and optional spaces',
        regex: /تم\s*√{1,2}\s*سحب\s*([\d,٫.]+)\s*.*? رصيدك/,
        map: { type: 'debit', amount: 1, person: 'Self Withdrawal' }
    },

    // --- DEBIT (HAWALT) ---
    {
        name: 'Debit (Hawalt) with fees and final currency',
        regex: /حولت\s*([\d,٫.]+)\s*لـ\s*(.*?)\s+رسوم\s+[\d,٫.]+\s+رصيدك/,
        map: { type: 'debit', amount: 1, person: 2 }
    },
    {
        name: 'Debit (Hawalt) with lamed preposition',
        regex: /حولت\s*([\d,٫.]+)\s*لـ(.*?)\s*(?:رسوم|م)/,
        map: { type: 'debit', amount: 1, person: 2 }
    },

    // --- CREDIT (AWDA'/AWDAAT) ---
    {
        name: 'Credit (Awda\') with slash and optional space currency',
        regex: /[أا]ودع\/(.*?) لحسابك\s*([\d,٫.]+)/,
        map: { type: 'credit', person: 1, amount: 2 }
    },
    {
        name: 'Credit (Awdaat) from company',
        regex: /أودعت ([\d,٫.]+) من (.*?) الرسوم .*? رصيدك/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
     {
        name: 'Credit (Tam Eidaa) YER via Agent',
        regex: /تم إيداع ([\d,٫.]+)ر\.ي عبر (.*?) رصيدك/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    // --- CREDIT (ISTALAMT/ASTALAMT) ---
    {
        name: 'Credit (Istalamt) amount YER from phone number',
        regex: /[أا]ستلمت مبلغ ([\d,٫.]+) .*? من (\d+) رصيدك هو/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Istalamt) amount YER from person',
        regex: /[أا]ستلمت ([\d,٫.]+)ر\.ي من (.*?) رصيدك/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
    {
        name: 'Credit (Istalamt) general with YER balance',
        regex: /[أا]ستلمت ([\d,٫.]+) من (.*?) رصيدك/,
        map: { type: 'credit', amount: 1, person: 2 }
    },
];

function cleanAndParseFloat(value: string): number {
    // Removes commas, replaces Arabic decimal separator, and then parses.
    return parseFloat(value.replace(/,/g, '').replace(/٫/g, '.').trim());
}

export function parseSms(smsBody: string): ParsedSms | null {
    const cleanedSms = smsBody.replace(/\s+/g, ' ').trim();

    for (const parser of parsers) {
        try {
            const match = cleanedSms.match(parser.regex);

            if (match) {
                const result: any = {
                    parsed: true,
                    type: parser.map.type,
                };

                // Amount must be a regex group
                if (typeof parser.map.amount === 'number') {
                    result.amount = cleanAndParseFloat(match[parser.map.amount]);
                }
                
                // Person can be hardcoded or from regex
                if (typeof parser.map.person === 'number') {
                     result.person = match[parser.map.person].trim();
                } else {
                    result.person = parser.map.person;
                }
                
                // Basic validation
                if (result.amount === undefined || !result.person || !result.type) {
                    continue; // If essential parts are missing, try next parser
                }

                return result as ParsedSms;
            }
        } catch (e) {
            console.error(`Error applying parser "${parser.name}":`, e);
            continue; // If an error occurs, just try the next parser
        }
    }
    return null; // No parser matched
}
