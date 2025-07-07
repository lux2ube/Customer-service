
export interface ParsedSms {
  type: 'credit' | 'debit';
  amount: number;
  person: string;
  currency: string;
}

interface SmsPattern {
  name: string;
  regex: RegExp;
  map: (match: RegExpMatchArray) => ParsedSms | null;
}

// Dictionary of regular expressions to parse different SMS formats.
// The /u flag is crucial for correct Unicode character handling.
const patterns: SmsPattern[] = [
  {
    name: 'Arabic Deposit - Format 1 (أودع)',
    // Matches: أودع/PERSON لحسابكAMOUNT CURRENCYرصيدك...
    // Example: أودع/عبدالله عبدالغفور لحسابك2500 YERرصيدك146688٫9YER
    // Handles cases with or without space before amount.
    regex: /أودع\/(.+) لحسابك\s*(\d+\.?\d*)\s*([A-Z]+)/u,
    map: (match) => {
      if (match.length < 4) return null;
      return {
        type: 'credit',
        person: match[1].trim(),
        amount: parseFloat(match[2]),
        currency: match[3].trim(),
      };
    },
  },
  {
    name: 'Arabic Deposit - Format 2 (تم إيداع)',
    // Matches: تم إيداع AMOUNT CURRENCY ... من طرف PERSON
    // Example: تم إيداع 25000 ريال يمني الى حسابك من طرف علي عبدالله صالح.
    regex: /تم إيداع (\d+\.?\d*)\s*(.+?)\s+الى حسابك من طرف (.+?)(\.|$)/u,
    map: (match) => {
        if (match.length < 4) return null;
        let currency = 'YER'; // Default
        if (match[2].includes('ريال يمني')) currency = 'YER';
        if (match[2].includes('ريال سعودي')) currency = 'SAR';
        if (match[2].includes('دولار')) currency = 'USD';

        return {
            type: 'credit',
            amount: parseFloat(match[1]),
            person: match[3].trim(),
            currency: currency,
        };
    },
  },
  {
    name: 'Arabic Debit - Format 1 (تم تحويل)',
    // Matches: تم تحويل مبلغ AMOUNT CURRENCY إلى PERSON
    // Example: تم تحويل مبلغ 500.00 ر.س. إلى فهد الغامدي
    regex: /تم تحويل مبلغ (\d+\.?\d*)\s*(.+?)\s+إلى (.+)/u,
    map: (match) => {
        if (match.length < 4) return null;
        let currency = 'SAR'; // Default
        if (match[2].includes('ر.س') || match[2].includes('ريال سعودي')) currency = 'SAR';
        if (match[2].includes('ريال يمني')) currency = 'YER';
        if (match[2].includes('دولار')) currency = 'USD';

        return {
            type: 'debit',
            amount: parseFloat(match[1]),
            person: match[3].trim(),
            currency: currency,
        };
    },
  },
   {
    name: 'Arabic Credit - Format 3 (استلمت)',
    // Matches: استلمت AMOUNT CURRENCY من PERSON
    // Example: استلمت 100 USD من شركة الأمل للصرافة.
    regex: /استلمت (\d+\.?\d*)\s*([A-Z]+)\s*من (.+?)\./u,
    map: (match) => {
      if (match.length < 4) return null;
      return {
        type: 'credit',
        amount: parseFloat(match[1]),
        currency: match[2].trim(),
        person: match[3].trim(),
      };
    },
  },
];

/**
 * Normalizes and cleans the SMS text before parsing.
 * @param text The raw SMS text.
 * @returns Cleaned text.
 */
function normalizeText(text: string): string {
    // Replace Arabic comma with a standard period for float parsing
    let cleanedText = text.replace(/٫/g, '.');
    // Remove extra whitespace and newlines
    cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    return cleanedText;
}


/**
 * Parses an SMS string using a dictionary of regular expressions.
 * @param sms The SMS message content.
 * @returns A ParsedSms object or null if no pattern matches.
 */
export function parseSmsWithRegex(sms: string): ParsedSms | null {
  const normalizedSms = normalizeText(sms);
  for (const pattern of patterns) {
    const match = normalizedSms.match(pattern.regex);
    if (match) {
      try {
        const result = pattern.map(match);
        // Basic validation on the mapped result
        if (result && result.amount > 0 && result.person.length > 0) {
            console.log(`Matched with regex pattern: ${pattern.name}`);
            return result;
        }
      } catch (e) {
        console.error(`Error mapping pattern "${pattern.name}":`, e);
        continue; // Try the next pattern
      }
    }
  }
  return null; // No pattern matched
}
