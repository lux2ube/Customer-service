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
  // Normalize by removing special characters and trimming whitespace.
  const normalizedMessage = message.replace('√', '').trim();

  const patterns = [
    // Covers:
    // استلمت 6,000.00 من صدام حسن احمد ا رصيدك...
    // استلمت مبلغ 42500 YER من 770909099 رصيدك...
    {
      regex: /استلمت(?: مبلغ)?\s*([\d,.]+)\s*(\S+)?\s*من\s*(.+?)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // Covers: حولت6,000.00لـباسم مصلح علي م...
    {
      regex: /حولت\s*([\d,.]+)\s*لـ\s*(.+?)\s*(?:بنجاح|رسوم)/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: null, person: m[2] })
    },
    // Covers: تحويل3000.00 SAR لـ وائل ابو عدله بنجاح...
    {
      regex: /تحويل\s*([\d,.]+)\s*(\S+)?\s*لـ\s*(.+?)\s*بنجاح/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // Covers: إضافة3000.00 SARمن خالد الحبيشي رصيدك...
    {
      regex: /إضافة\s*([\d,.]+)\s*(\S+)?\s*من\s*(.+?)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // Covers: أودع/وديد خالد لحسابك23 USDرصيدك... and أودع/باسم محمد لحسابك6900 YERرصيدك...
    {
      regex: /أودع\/(.+?)\s*لحسابك\s*([\d.,٫]+)\s*(\S+)?\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[2], currency: m[3], person: m[1] })
    },
  ];

  for (const p of patterns) {
    const match = normalizedMessage.match(p.regex);
    if (match) {
      try {
        const result = p.map(match);
        // Replace both standard and Arabic commas before parsing.
        const amount = parseFloat(result.amount.replace(/[,٫]/g, ''));
        const currencySymbol = result.currency?.trim().toUpperCase();
        
        // Return null for currency if not found in SMS; the processing action will use the account's default.
        const currency = currencySymbol ? (currencyMap[currencySymbol] || currencySymbol) : null;

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

  // If no pattern matched, return 'unknown'.
  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
