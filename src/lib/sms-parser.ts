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
  // Normalize the message: remove some special characters that can interfere.
  const normalizedMessage = message.replace('√', '').trim();

  // A dictionary of robust patterns to try in order.
  // They are designed to be flexible with whitespace (\s*).
  const patterns = [
    // Matches: "أودع/باسم محمد لحسابك6900 YERرصيدك..."
    // This is a very flexible pattern for deposit messages starting with "أودع/".
    {
      regex: /أودع\/(.+?)\s*لحسابك\s*([\d,.,٫]+)\s*(\S+)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, person: m[1], amount: m[2], currency: m[3] })
    },
    // Matches: "استلمت مبلغ 42500 YER من 770909099 رصيدك..." or "استلمت 6,000.00 من صدام حسن احمد ا رصيدك..."
    // This handles the common "استلمت" (Received) format.
    {
      regex: /استلمت(?:\s*مبلغ)?\s*([\d,.,٫]+)\s*(\S+)?\s*من\s*(.+?)\s*رصيدك/,
      map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2] || 'YER', person: m[3] })
    },
    // Matches: "إضافة3000.00 SARمن خالد الحبيشي رصيدك..."
    // This handles the common "إضافة" (Addition) format.
    {
        regex: /إضافة\s*([\d,.,٫]+)\s*(\S+)?\s*من\s*(.+?)\s*رصيدك/,
        map: (m: RegExpMatchArray) => ({ type: 'credit' as const, amount: m[1], currency: m[2] || 'YER', person: m[3] })
    },
    // A combined pattern for "حولت" (Transferred) or "تحويل" (Transfer) messages.
    // Example: "حولت6,000.00لـباسم مصلح علي م..." or "تحويل3000.00 SAR لـ وائل ابو عدله بنجاح..."
    {
      regex: /(?:حولت|تحويل)\s*([\d,.,٫]+)\s*(\S+)?\s*لـ\s*(.+?)\s*(?:بنجاح|رسوم)/,
      map: (m: RegExpMatchArray) => ({ type: 'debit' as const, amount: m[1], currency: m[2] || 'YER', person: m[3] })
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
        // This helps in debugging if a pattern's map function has an error.
        console.error("Error applying map function for pattern:", p.regex, "Original Message:", message, e);
      }
    }
  }

  // If no patterns matched, return a default 'unknown' object.
  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
