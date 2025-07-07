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
  // Normalize by removing some characters and trimming whitespace, but preserve internal spacing.
  const normalizedMessage = message.replace(/[√]/g, '').trim();

  const patterns = [
    /**
     * PATTERN 1: For "أودع" (deposit) messages.
     * Correctly handles cases with and without spaces around the amount and currency.
     * The key fix is using `(.*?)` for the person, which is non-greedy and stops correctly before the `لحسابك` keyword.
     * Example: "أودع/باسم محمد لحسابك6900 YERرصيدك132888٫9YER"
     */
    {
      regex: /أودع\/(?<person>.*?)\s*لحسابك\s*(?<amount>[\d.,٫]+)\s*(?<currency>\S+)\s*رصيدك/,
      type: 'credit' as const
    },

    /**
     * PATTERN 2: For "استلمت" (Received) messages.
     * The word "مبلغ" is optional.
     * Examples: "استلمت مبلغ 42500 YER من 770909099 رصيدك..." or "استلمت 6,000.00 من صدام حسن احمد ا رصيدك..."
     */
    {
      regex: /استلمت(?:\s*مبلغ)?\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/,
      type: 'credit' as const
    },

    /**
     * PATTERN 3: For "إضافة" (Addition) messages.
     * Example: "إضافة3000.00 SARمن خالد الحبيشي رصيدك..."
     */
    {
        regex: /إضافة\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*من\s*(?<person>.+?)\s*رصيدك/,
        type: 'credit' as const
    },

    /**
     * PATTERN 4: For "حولت" (Transferred) or "تحويل" (Transfer) debit messages.
     * Handles different endings like "بنجاح" or "رسوم".
     * Example: "حولت6,000.00لـباسم مصلح علي م..." or "تحويل3000.00 SAR لـ وائل ابو عدله بنجاح..."
     */
    {
      regex: /(?:حولت|تحويل)\s*(?<amount>[\d,.,٫]+)\s*(?<currency>\S+)?\s*لـ\s*(?<person>.+?)\s*(?:بنجاح|رسوم)/,
      type: 'debit' as const
    },
  ];

  for (const p of patterns) {
    const match = normalizedMessage.match(p.regex);
    
    if (match && match.groups) {
        const { amount, currency: rawCurrency, person } = match.groups;
        
        // Sanity check for captured groups
        if (amount === undefined || person === undefined) continue;

        const parsedAmount = parseFloat(amount.replace(/[,٫]/g, ''));
        
        // Handle currency mapping, defaulting to null if not found.
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

  // If no patterns matched, return a default 'unknown' object.
  return { type: 'unknown', amount: null, currency: null, person: null, raw: message };
}
