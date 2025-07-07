
import type { ParsedSms } from './types';

const currencyMap: { [key: string]: string } = {
  "ر.ي": "YER",
  "ر.س": "SAR",
  "YER": "YER",
  "SAR": "SAR",
  "USD": "USD",
};

// This function attempts to parse various SMS formats for financial transactions.
// It uses a series of regular expressions tailored to the example messages.
export function parseSms(message: string): ParsedSms {
  const normalizedMessage = message.replace(/\s+/g, ' ').replace('√', '').trim();

  const patterns = [
    // استلمت 6,000.00 من صدام حسن احمد ا رصيدك...
    // استلمت مبلغ 42500 YER من 770909099 رصيدك...
    {
      regex: /استلمت(?: مبلغ)? ([\d,.]+) ?(\S+)? من (.+?) رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2] || 'YER', person: m[3] })
    },
    // حولت6,000.00لـباسم مصلح علي م...
    {
      regex: /حولت([\d,.]+)لـ(.+?) رسوم/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: 'YER', person: m[2] })
    },
    // تحويل3000.00 SAR لـ وائل ابو عدله بنجاح...
    {
      regex: /تحويل([\d,.]+) (SAR|USD|YER) لـ (.+?) بنجاح/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // إضافة3000.00 SARمن خالد الحبيشي رصيدك...
    {
      regex: /إضافة([\d,.]+) (SAR|USD|YER)من (.+?) رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // أودع/وديد خالد لحسابك23 USDرصيدك...
    {
      regex: /أودع\/(.+?) لحسابك([\d.,٫]+) (USD|SAR|YER)/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[2], currency: m[3], person: m[1] })
    },
  ];

  for (const p of patterns) {
    const match = normalizedMessage.match(p.regex);
    if (match) {
      try {
        const result = p.map(match);
        const amount = parseFloat(result.amount.replace(/[,٫]/g, ''));
        const currencySymbol = result.currency.toUpperCase();
        const currency = currencyMap[currencySymbol] || currencySymbol;

        if (!isNaN(amount)) {
          return {
            type: result.type,
            amount,
            currency,
            person: result.person.trim(),
            raw: message,
          };
        }
      } catch (e) {
        console.error("Error parsing SMS with pattern:", p.regex, e);
      }
    }
  }

  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
