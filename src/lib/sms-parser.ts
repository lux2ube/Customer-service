
import type { ParsedSms } from '@/lib/types';

// A list of parser configurations, ordered by priority.
// Each parser has a regex and a map to extract data.
const parsers = [
    // --- DEBIT (KHASM) ---
    {
        name: 'Debit (Khasm) SAR Hazmi Transfer',
        regex: /^خصم ([\d,.]+)(ر\.س) مقابل إرسال حوالة حزمي تحويل رص:.*? الى (.*)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) YER Local Transfer',
        regex: /^خصم ([\d,.]+)(ر\.ي) مقابل إرسال حوالة محلية رص:.*? الى (.*)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) YER to Kash number',
        regex: /^خصم ([\d,.]+)(ر\.ي) مقابل تحويل لمحفظة\/بنك رص:.*? الى (كاش رقم \d+)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) YER to phone number with balance',
        regex: /^خصم ([\d,.]+)(ر\.ي) تحويل لمحفظة\/بنك رص:.*? الى (.*)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) from ATM - YKB',
        regex: /^خصم ([\d,.]+)(ر\.ي) سحب من الصراف الآلي YKB رص:.*?ر\.ي$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 'YKB ATM' }
    },
    {
        name: 'Debit (Khasm) cash withdrawal SAR - no space',
        regex: /^خصم ([\d,.]+)(ر\.س) سحب نقدي رص:.*?ر\.س$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 'Cash Withdrawal' }
    },
    {
        name: 'Debit (Khasm) from ATM',
        regex: /^خصم ([\d,.]+)(ر\.ي) سحب من (.*?) رص:.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    
    // --- DEBIT (TAM) ---
    {
        name: 'Debit (Tam Tahweel) without spaces',
        regex: /^تم تحويل([\d,.]+)لحساب (.*?) رصيدك.*?$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 'YER' }
    },
    {
        name: 'Debit (Tam Sahab) YER via Haseb',
        regex: /^تم سحب ([\d,.]+) رصيدك .*? (YER)،عبر (حاسب ادفع قيمة مشترياتك بسهولة)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Tam Sahab) YER',
        regex: /^تم سحب المبلغ\s+([\d,.]+) رصيدك .*? ريال يمني\.$/,
        map: { type: 'debit', amount: 1, person: 'Self Withdrawal', currency: 'YER' }
    },
    {
        name: 'Debit (Tam Khasm) for purchases',
        regex: /^تم خصم ([\d,.]+) من حسابك مقابل مشترياتك من (.*?) رصيدك .*?(YER|SAR|USD)$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 3 }
    },
    {
        name: 'Debit (Tam Tahweel) with checkmarks',
        regex: /^تم\s*√\s*√\s*تحويل([\d,.]+)\s*(SAR|USD|YER) لـ (.*?) بنجاح.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Tam Sahab) with checkmarks',
        regex: /^تم\s*√\s*√\s*سحب ([\d,.]+)\s*(YER|SAR|USD) رصيدك.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 'Self Withdrawal' }
    },

    // --- DEBIT (HAWALT) ---
    {
        name: 'Debit (Hawalt) with lamed preposition',
        regex: /^حولت([\d,.]+)لـ(.*?)(?: رسوم | م)?.*?ر\.ي$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 'YER' }
    },

    // --- CREDIT (AWDA'/AWDAAT) ---
    {
        name: 'Credit (Awda\') with slash and optional space currency',
        regex: /^أودع\/(.*?) لحسابك([\d,.]+)\s*(YER|SAR|USD).*$/,
        map: { type: 'credit', person: 1, amount: 2, currency: 3 }
    },
    {
        name: 'Credit (Awdaat) from company',
        regex: /^أودعت ([\d,.]+) من (.*?) الرسوم .*? رصيدك.*? ر\.ي$/,
        map: { type: 'credit', amount: 1, person: 2, currency: 'YER' }
    },

    // --- CREDIT (IDIF/ADIFA) ---
    {
        name: 'Credit (Idif) from Mobile Money',
        regex: /^اضيف ([\d,.]+)(ر\.ي) مقابل تحويل من محفظة\/بنك رص:.*? من (موبايل موني رقم \d+)$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Idif) for Hawala exchange',
        regex: /^اضيف ([\d,.]+)(ر\.ي) مقابل صرف حوالة الى المحفظة رص:.*? من (.*)$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Idif) from person with optional phone',
        regex: /^اضيف ([\d,.]+)(ر\.ي) تحويل مشترك رص:.* من (.*?)(?:-\d+)?$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Idafa) with checkmarks and optional space currency',
        regex: /^تم\s*√\s*√\s*إضافة([\d,.]+)\s*(USD|SAR|YER)من (.*?) رصيدك.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Tam Idaa) YER',
        regex: /^تم ايداع ([\d,.]+)\s*(YER) لحسابكم المرسل (.*?) الرصيد.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Tam Eidaa) YER via Agent',
        regex: /^تم إيداع ([\d,.]+)ر\.ي عبر (.*?) رصيدك .*? ر\.ي$/,
        map: { type: 'credit', amount: 1, person: 2, currency: 'YER' }
    },

    // --- CREDIT (ISTALAMT/ASTALAMT) ---
    {
        name: 'Credit (Istalamt) amount YER from phone number',
        regex: /^[أا]ستلمت مبلغ ([\d,.]+) (YER|SAR|USD) من (\d+) رصيدك هو.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Istalamt) amount YER from person',
        regex: /^[أا]ستلمت ([\d,.]+)ر\.ي من (.*?) رصيدك .*? ر\.ي$/,
        map: { type: 'credit', amount: 1, person: 2, currency: 'YER' }
    },
    {
        name: 'Credit (Istalamt) general with YER balance',
        regex: /^[أا]ستلمت ([\d,.]+) من (.*?)(?: ا)? رصيدك.*? ر\.ي$/,
        map: { type: 'credit', amount: 1, person: 2, currency: 'YER' }
    },
];

function cleanAndParseFloat(value: string): number {
    // Removes commas and other non-numeric characters before parsing.
    return parseFloat(value.replace(/,/g, '').trim());
}

function mapCurrency(currency: string): string {
    if (currency === 'ر.ي') return 'YER';
    if (currency === 'ر.س') return 'SAR';
    return currency;
}


export function parseSms(smsBody: string): ParsedSms | null {
    const cleanedSms = smsBody.replace(/\s+/g, ' ').trim();

    for (const parser of parsers) {
        const match = cleanedSms.match(parser.regex);

        if (match) {
            try {
                const result: any = {
                    parsed: true,
                    type: parser.map.type,
                };

                // Amount must be a regex group
                result.amount = cleanAndParseFloat(match[parser.map.amount as number]);
                
                // Person can be hardcoded or from regex
                if (typeof parser.map.person === 'number') {
                     result.person = match[parser.map.person].trim();
                } else {
                    result.person = parser.map.person;
                }
                
                // Currency can be hardcoded or from regex
                if (typeof parser.map.currency === 'number') {
                    result.currency = mapCurrency(match[parser.map.currency]);
                } else {
                    result.currency = parser.map.currency;
                }

                // Basic validation
                if (!result.amount || !result.person || !result.type || !result.currency) {
                    continue; // If essential parts are missing, try next parser
                }

                return result as ParsedSms;

            } catch (e) {
                console.error(`Error applying parser "${parser.name}":`, e);
                continue; // If an error occurs, just try the next parser
            }
        }
    }
    return null; // No parser matched
}
