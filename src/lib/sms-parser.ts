
export interface ParsedSms {
  type: 'credit' | 'debit';
  amount: number;
  person: string;
  currency: string;
}

interface SmsPattern {
  name: string;
  regex: RegExp;
  map: (match: RegExpMatchArray, cleanedText: string) => ParsedSms | null;
}

const patterns: SmsPattern[] = [
    // 1. حولت6,000.00لـباسم مصلح علي م...
    {
        name: 'Debit - حولت لـ',
        regex: /حولت\s*([\d,]+\.?\d*)\s*لـ(.+?)(?=\s*رسوم|\s*رصيدك|\s*تم|√|$)/su,
        map: (match, cleanedText) => {
            const currencyMatch = cleanedText.match(/ر\.ي|YER|SAR|USD/u);
            return {
                type: 'debit',
                amount: parseFloat(match[1].replace(/,/g, '')),
                person: match[2].trim(),
                currency: currencyMatch ? currencyMatch[0].replace('ر.ي', 'YER') : 'YER',
            };
        },
    },
    // 2. تم تحويل10100لحساب عمار محمد رصيدك...
    {
        name: 'Debit - تم تحويل لحساب',
        regex: /تم تحويل\s*(\d+\.?\d*)\s*لحساب\s*(.+?)\s*رصيدك/u,
        map: (match, cleanedText) => {
            const currencyMatch = cleanedText.match(/YER|SAR|USD/u);
            return {
                type: 'debit',
                amount: parseFloat(match[1]),
                person: match[2].trim(),
                currency: currencyMatch ? currencyMatch[0] : 'YER',
            };
        },
    },
    // 3. تم تحويل3000.00 SAR لـ وائل ابو عدله بنجاح
    {
        name: 'Debit - تم تحويل لـ',
        regex: /تم\s*√*\s*تحويل\s*([\d,]+\.?\d*)\s*([A-Z]+)\s*لـ\s*(.+?)\s*بنجاح/su,
        map: (match) => ({
            type: 'debit',
            amount: parseFloat(match[1].replace(/,/g, '')),
            currency: match[2].trim(),
            person: match[3].trim(),
        }),
    },
    // 4. أودع/محمد احمد لحسابك35000 YER...
    {
        name: 'Credit - أودع/',
        regex: /أودع\/(.+?)\s* لحسابك\s*(\d+\.?\d*)\s*([A-Z]+)/u,
        map: (match) => ({
            type: 'credit',
            person: match[1].trim(),
            amount: parseFloat(match[2]),
            currency: match[3].trim(),
        }),
    },
    // 5. استلمت 6,000.00 من صدام حسن...
    {
        name: 'Credit - استلمت من',
        regex: /استلمت\s*([\d,]+\.?\d*)\s*من\s*(.+?)\s*رصيدك/su,
        map: (match, cleanedText) => {
            const currencyMatch = cleanedText.match(/ر\.ي|YER|SAR|USD/u);
            return {
                type: 'credit',
                amount: parseFloat(match[1].replace(/,/g, '')),
                person: match[2].trim(),
                currency: currencyMatch ? currencyMatch[0].replace('ر.ي', 'YER') : 'YER',
            };
        },
    },
    // 6. إضافة21.00 USDمن حسام الحاج...
    {
        name: 'Credit - إضافة من',
        regex: /(?:إضافة|اضيف)\s*([\d,]+\.?\d*)\s*([A-Z]+|ر\.ي)\s*من\s*(.+?)(?=\s*رصيدك|$)/su,
        map: (match) => ({
            type: 'credit',
            amount: parseFloat(match[1].replace(/,/g, '')),
            currency: match[2].trim().replace('ر.ي', 'YER'),
            person: match[3].trim(),
        }),
    },
    // 7. استلمت مبلغ 11300 YER من 776782646...
    {
        name: 'Credit - استلمت مبلغ من',
        regex: /استلمت مبلغ\s*([\d,]+\.?\d*)\s*([A-Z]+)\s*من\s*([^\s]+)/u,
        map: (match) => ({
            type: 'credit',
            amount: parseFloat(match[1].replace(/,/g, '')),
            currency: match[2].trim(),
            person: match[3].trim(),
        }),
    },
    // 8. اضيف 6000ر.ي ... من علاء علي طه...
    {
        name: 'Credit - اضيف من',
        regex: /اضيف\s*([\d,]+)\s*ر\.ي.*?من\s*(.+)$/u,
        map: (match) => ({
            type: 'credit',
            amount: parseFloat(match[1].replace(/,/g, '')),
            currency: 'YER',
            person: match[2].trim().split(/رص/)[0].trim(),
        }),
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
  // Remove checkmark characters and normalize whitespace
  cleanedText = cleanedText.replace(/√/g, '').replace(/\s+/g, ' ').trim();
  // Add space between letters and numbers for easier matching e.g. "word123" -> "word 123"
  cleanedText = cleanedText.replace(/([^\d\s])(\d)/gu, '$1 $2').replace(/(\d)([^\d\s.])/gu, '$1 $2');
  return cleanedText;
}


/**
 * Parses an SMS string using a dictionary of regular expressions.
 * This is a reliable method for known SMS formats.
 * @param sms The SMS message content.
 * @returns A ParsedSms object or null if no pattern matches.
 */
export function parseSmsWithRegex(sms: string): ParsedSms | null {
  const normalizedSms = normalizeText(sms);
  for (const pattern of patterns) {
    const match = normalizedSms.match(pattern.regex);
    if (match) {
      try {
        const result = pattern.map(match, normalizedSms);
        if (result && result.amount > 0 && result.person.length > 0) {
            console.log(`SMS Parser: Matched with regex pattern "${pattern.name}"`);
            return result;
        }
      } catch (e) {
        console.error(`SMS Parser: Error mapping pattern "${pattern.name}":`, e);
        continue;
      }
    }
  }
  console.log(`SMS Parser: No regex pattern matched for: "${normalizedSms}"`);
  return null;
}
