import type { ParsedSms } from './types';

// This is a mapping of currency symbols/codes found in SMS messages
// to a standardized currency code.
const currencyMap: { [key: string]: string } = {
  "ر.ي": "YER",
  "ر.س": "SAR",
  "YER": "YER",
  "SAR": "SAR",
  "USD": "USD",
};

/**
 * Parses a variety of financial SMS formats into a structured object.
 * It tries a list of regular expressions in order. The first one that matches
 * successfully will be used.
 * @param message The raw SMS message string.
 * @returns A ParsedSms object.
 */
export function parseSms(message: string): ParsedSms {
  // Normalize the message: remove some special characters.
  const normalizedMessage = message.replace('√', '').trim();

  // This is the dictionary of patterns. Each pattern is tried in order.
  // The \s* makes whitespace optional, which handles variations like "word1word2" and "word1 word2".
  const patterns = [
    // Pattern 1: For "استلمت..." messages.
    // Example: "استلمت مبلغ 42500 YER من 770909099 رصيدك..."
    // Example: "استلمت 6,000.00 من صدام حسن احمد ا رصيدك..."
    {
      regex: /استلمت(?:\s*مبلغ)?\s*([\d,.]+)\s*(\S+)?\s*من\s*(.+?)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2] || 'YER', person: m[3] })
    },
    // Pattern 2: For "حولت..." messages.
    // Example: "حولت6,000.00لـباسم مصلح علي م..."
    {
      regex: /حولت\s*([\d,.]+)\s*لـ\s*(.+?)\s*(?:بنجاح|رسوم)/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: 'YER', person: m[2] })
    },
    // Pattern 3: For "تحويل..." messages.
    // Example: "تحويل3000.00 SAR لـ وائل ابو عدله بنجاح..."
    {
      regex: /تحويل\s*([\d,.]+)\s*(SAR|USD|YER|ر\.س|ر\.ي)?\s*لـ\s*(.+?)\s*بنجاح/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // Pattern 4: For "إضافة..." messages.
    // Example: "إضافة3000.00 SARمن خالد الحبيشي رصيدك..."
    {
      regex: /إضافة\s*([\d,.]+)\s*(SAR|USD|YER|ر\.س|ر\.ي)?\s*من\s*(.+?)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2], person: m[3] })
    },
    // Pattern 5: For "أودع..." messages. This is the most complex one.
    // It's designed to be flexible with whitespace.
    // Example: "أودع/باسم محمد لحسابك6900 YERرصيدك132888٫9YER"
    // Example: "أودع/وديد خالد لحسابك23 USDرصيدك..."
    {
      regex: /أودع\/(.+?)\s*لحسابك\s*([\d.,٫]+)\s*(USD|SAR|YER|ر\.ي|ر\.س)?\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, person: m[1], amount: m[2], currency: m[3] })
    },
  ];

  for (const p of patterns) {
    const match = normalizedMessage.match(p.regex);
    if (match) {
      try {
        const result = p.map(match);
        // Replace both standard and Arabic commas before parsing the number.
        const amount = parseFloat(result.amount.replace(/[,٫]/g, ''));
        
        // Handle currency mapping. Default to null if not present.
        const currencySymbol = result.currency?.trim().toUpperCase();
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
        // If there's an error with one pattern, just log it and try the next.
        console.error("Error parsing SMS with pattern:", p.regex, "Message:", message, e);
      }
    }
  }

  // If no patterns matched, return a default 'unknown' object.
  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
