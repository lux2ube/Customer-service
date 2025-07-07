
import type { ParsedSms } from '@/lib/types';

// A list of parser configurations, ordered by priority.
// Each parser has a regex and a map to extract data.
const parsers = [
    {
        name: 'Debit (Khasm) to Phone Number',
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
    return currency === 'ر.ي' ? 'YER' : currency;
}


export function parseSms(smsBody: string): ParsedSms | null {
    const cleanedSms = smsBody.replace(/\s+/g, ' ').trim();

    for (const parser of parsers) {
        const match = cleanedSms.match(parser.regex);

        if (match) {
            try {
                const result: any = {
                    type: parser.map.type,
                };

                result.amount = cleanAndParseFloat(match[parser.map.amount as number]);
                result.person = match[parser.map.person as number].trim();
                
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
