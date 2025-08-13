
import type { ParsedSms, SmsParsingRule } from '@/lib/types';

function escapeRegex(string: string): string {
  // $& means the whole matched string
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanAndParseFloat(value: string): number {
    // Removes commas, Arabic decimal separators, and other non-numeric characters before parsing.
    return parseFloat(value.replace(/,/g, '').replace(/٫/g, '.').trim());
}

export function parseSmsWithCustomRules(smsBody: string, rules: SmsParsingRule[]): ParsedSms | null {
    const cleanedSms = smsBody.replace(/\s+/g, ' ').trim();

    for (const rule of rules) {
        try {
            // --- Extract Amount Independently ---
            const amountPattern = new RegExp(
                escapeRegex(rule.amountStartsAfter) +
                '\\s*([\\d,٫.]+?)\\s*' + // Capture group 1: The amount (non-greedy)
                escapeRegex(rule.amountEndsBefore),
                'i' // Case-insensitive
            );
            const amountMatch = cleanedSms.match(amountPattern);
            if (!amountMatch || !amountMatch[1]) {
                continue; // Amount not found, try next rule
            }
            const amount = cleanAndParseFloat(amountMatch[1]);
            
            // --- Extract Person Independently ---
            let personPattern: RegExp;
            if (rule.personEndsBefore && rule.personEndsBefore.trim() !== '') {
                 personPattern = new RegExp(
                    escapeRegex(rule.personStartsAfter) +
                    '\\s*(.*?)\\s*' + // Capture group 1: The person's name (non-greedy)
                    escapeRegex(rule.personEndsBefore),
                    'i' // Case-insensitive
                );
            } else {
                // If personEndsBefore is empty, capture everything until the end of the string.
                 personPattern = new RegExp(
                    escapeRegex(rule.personStartsAfter) +
                    '\\s*([^\\d\\s.,]+(?:\\s+[^\\d\\s.,]+)*)', // Capture group 1: More robustly capture names, avoiding trailing numbers/symbols
                    'i' // Case-insensitive
                );
            }

            const personMatch = cleanedSms.match(personPattern);
            if (!personMatch || !personMatch[1]) {
                continue; // Person not found, try next rule
            }
            const person = personMatch[1].trim();

            // Ensure we got valid data from both extractions
            if (!isNaN(amount) && person) {
                return {
                    parsed: true,
                    type: rule.type,
                    amount,
                    person,
                };
            }

        } catch (e) {
            console.error(`Error applying custom rule "${rule.name}":`, e);
            continue; // Move to the next rule if this one fails
        }
    }
    
    // If no custom rules matched, return null
    return null;
}
