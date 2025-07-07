import type { ParsedSms } from '@/lib/types';

// A list of parser configurations, ordered by priority.
// Each parser has a regex and a map to extract data.
const parsers = [
    {
        name: 'Debit (Khasm) to phone number with balance',
        regex: /^خصم (\d+)(ر\.ي) تحويل لمحفظة\/بنك رص:.*? الى (.*)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) from ATM - YKB',
        regex: /^خصم (\d+)ر\.ي سحب من الصراف الآلي YKB رص:.*?ر\.ي$/,
        map: { type: 'debit', amount: 1, currency: 'YER', person: 'YKB ATM' }
    },
    {
        name: 'Debit (Khasm) cash withdrawal SAR',
        regex: /^خصم ([\d,.]+) ر\.س سحب نقدي رص:.*?ر\.س$/,
        map: { type: 'debit', amount: 1, currency: 'SAR', person: 'Cash Withdrawal' }
    },
    {
        name: 'Debit (Tam Khasm) for purchases - no currency',
        regex: /^تم خصم ([\d,.]+) من حسابك مقابل مشترياتك من (.*?) رصيدك .*?YER$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 'YER' }
    },
    {
        name: 'Debit (Tam Khasm) for purchases',
        regex: /^تم خصم ([\d,.]+) من حسابك مقابل مشترياتك من (.*?) رصيدك .*?(YER|SAR|USD)$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 3 }
    },
    {
        name: 'Debit (Khasm) from ATM',
        regex: /^خصم (\d+)(ر\.ي) سحب من (.*?) رص:.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Khasm) to Phone Number - Generic',
        regex: /^خصم (\d+)(ر\.ي) تحويل لمحفظة\/بنك.*? الى (.*)$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Tam Tahweel) without spaces',
        regex: /^تم تحويل(\d+)لحساب (.*?) رصيدك.*$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 'YER' } // Assuming YER default
    },
    {
        name: 'Credit (Awda\') with slash',
        regex: /^أودع\/(.*?) لحسابك(\d+) (YER|SAR|USD).*$/,
        map: { type: 'credit', person: 1, amount: 2, currency: 3 }
    },
    {
        name: 'Credit (Istalamt) with comma amount',
        regex: /^استلمت ([\d,.]+) من (.*?)(?: ا)? رصيدك.*$/,
        map: { type: 'credit', amount: 1, person: 2, currency: 'YER' } // Assuming YER from ر.ي later
    },
    {
        name: 'Debit (Hawalt) with lamed preposition',
        regex: /^حولت([\d,.]+)لـ(.*?)(?: م)? رسوم.*$/,
        map: { type: 'debit', amount: 1, person: 2, currency: 'YER' }
    },
    {
        name: 'Credit (Idafa) with checkmarks',
        regex: /^تم√√ إضافة([\d,.]+) (USD|SAR|YER)من (.*?) رصيدك.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Tahweel) with checkmarks',
        regex: /^تم√√ تحويل([\d,.]+) (SAR|USD|YER) لـ (.*?) بنجاح.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Debit (Tam Sahab) with checkmarks',
        regex: /^تم√√ سحب ([\d,.]+) (YER|SAR|USD) رصيدك.*$/,
        map: { type: 'debit', amount: 1, currency: 2, person: 'Self Withdrawal' }
    },
    {
        name: 'Credit (Istalamt) from phone number',
        regex: /^استلمت مبلغ (\d+) (YER|SAR|USD) من (\d+) رصيدك.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
    },
    {
        name: 'Credit (Idif) from person with phone',
        regex: /^اضيف (\d+)(ر\.ي) تحويل مشترك رص:.* من (.*?)-.*$/,
        map: { type: 'credit', amount: 1, currency: 2, person: 3 }
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
