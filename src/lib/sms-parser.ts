import type { ParsedSms } from './types';

/**
 * This file contains a robust SMS parsing engine. It uses a "dictionary" of regular expressions
 * to flexibly parse various financial transaction formats.
 *
 * How it works:
 * 1. It tries a list of patterns in order.
 * 2. The first pattern that successfully matches the SMS message is used.
 * 3. Named capture groups `(?<group_name>...)` are used to extract data reliably.
 * 4. The patterns are designed to be flexible with whitespace to handle real-world SMS inconsistencies.
 * 5. All patterns use the `/u` flag for proper Unicode handling in the Node.js environment.
 *
 * To support a new SMS format, simply add a new object to the `patterns` array.
 */

const currencyMap: { [key: string]: string } = {
  "ر.ي": "YER",
  "ر.س": "SAR",
  "YER": "YER",
  "SAR": "SAR",
  "USD": "USD",
};

export function parseSms(message: string): ParsedSms {
  // More aggressive normalization to handle various whitespace characters and other common SMS artifacts.
  const normalizedMessage = message
    .replace(/[√]/g, '')
    .replace(/[\u00A0\u200B-\u200D\uFEFF]/g, ' ') // Replace various zero-width and non-breaking spaces
    .trim();

  const patterns = [
    /**
     * PATTERN 1: For "أودع" (deposit) messages. Made more robust.
     * The `u` flag is added for proper Unicode handling.
     * `\s*` handles inconsistent spacing.
     * `(?:باسم\s*)?` makes the word "باسم" optional.
     * Example: "أودع/باسم محمد لحسابك6900 YERرصيدك132888٫9YER"
     */
    {
      regex: /أودع\/(?:باسم\s*)?(?<person>.+?)\s*لحسابك\s*(?<amount>[\d,٫.]+)\s*(?<currency>\S+?)\s*رصيدك/u,
      type: 'credit' as const
    },

    /**
     * PATTERN 2: For "استلمت" (Received) messages.
     * Example: "استلمت مبلغ 42500 YER من 770909099 رصيدك..."
     */
    {
      regex: /استلمت(?:\s*مبلغ)?\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/u,
      type: 'credit' as const
    },

    /**
     * PATTERN 3: For "إضافة" (Addition) messages.
     * Example: "إضافة3000.00 SARمن خالد الحبيشي رصيدك..."
     */
    {
        regex: /إضافة\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/u,
        type: 'credit' as const
    },

    /**
     * PATTERN 4: For "حولت" (Transferred) or "تحويل" (Transfer) debit messages.
     * Example: "تحويل3000.00 SAR لـ وائل ابو عدله بنجاح..."
     */
    {
      regex: /(?:حولت|تحويل)\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*لـ\s*(?<person>.+?)\s*(?:بنجاح|رسوم)/u,
      type: 'debit' as const
    },
  ];

  for (const p of patterns) {
    const match = normalizedMessage.match(p.regex);
    
    if (match && match.groups) {
        const { amount, currency: rawCurrency, person } = match.groups;
        
        if (amount === undefined || person === undefined) continue;

        const parsedAmount = parseFloat(amount.replace(/[,٫]/g, ''));
        
        const currencySymbol = rawCurrency?.trim().toUpperCase();
        const currency = currencySymbol ? (currencyMap[currencySymbol] || currencySymbol) : null;

        if (!isNaN(parsedAmount)) {
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

  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
