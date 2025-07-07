import type { ParsedSms } from './types';

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
  // Each regex is designed to be flexible with whitespace and uses named capture groups.
  const patterns = [
    // PATTERN 1: For "أودع" (deposit) messages, especially with no spaces.
    // Example: "أودع/باسم محمد لحسابك6900 YERرصيدك132888٫9YER"
    {
      regex: /أودع\/(?<person>.+?)\s*لحسابك\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+?)\s*رصيدك/,
      type: 'credit' as const
    },
    // PATTERN 2: For "استلمت" (Received) messages.
    // Examples: "استلمت مبلغ 42500 YER من 770909099 رصيدك..." or "استلمت 6,000.00 من صدام حسن احمد ا رصيدك..."
    {
      regex: /استلمت(?:\s*مبلغ)?\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/,
      type: 'credit' as const
    },
    // PATTERN 3: For "إضافة" (Addition) messages.
    // Example: "إضافة3000.00 SARمن خالد الحبيشي رصيدك..."
    {
        regex: /إضافة\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/,
        type: 'credit' as const
    },
    // PATTERN 4: A combined pattern for "حولت" (Transferred) or "تحويل" (Transfer) debit messages.
    // Example: "حولت6,000.00لـباسم مصلح علي م..." or "تحويل3000.00 SAR لـ وائل ابو عدله بنجاح..."
    {
      regex: /(?:حولت|تحويل)\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*لـ\s*(?<person>.+?)\s*(?:بنجاح|رسوم)/,
      type: 'debit' as const
    },
  ];

  for (const p of patterns) {
    const match = p.regex.exec(normalizedMessage);
    if (match && match.groups) {
        const { amount, currency: rawCurrency, person } = match.groups;
        // Replace both standard and Arabic commas before parsing the number.
        const parsedAmount = parseFloat(amount.replace(/[,٫]/g, ''));
        
        // Handle currency mapping. Default to null if not present.
        const currencySymbol = rawCurrency?.trim().toUpperCase();
        const currency = currencySymbol ? (currencyMap[currencySymbol] || currencySymbol) : null;

        if (!isNaN(parsedAmount) && person) {
          return {
            type: p.type,
            amount: parsedAmount,
            currency,
            person: person.trim(),
            raw: message,
          };
        }
    }
  }

  // If no patterns matched, return a default 'unknown' object.
  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
