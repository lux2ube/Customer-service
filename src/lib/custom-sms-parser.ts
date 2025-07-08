
import type { ParsedSms, SmsParsingRule } from '@/lib/types';

function escapeRegex(string: string): string {
  // $& means the whole matched string
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanAndParseFloat(value: string): number {
    // Removes commas and other non-numeric characters before parsing.
    return parseFloat(value.replace(/,/g, '').trim());
}

export function parseSmsWithCustomRules(smsBody: string, rules: SmsParsingRule[]): ParsedSms | null {
    // Use a cleaned version of the SMS for matching, replacing multiple spaces with a single one.
    const cleanedSms = smsBody.replace(/\s+/g, ' ').trim();

    for (const rule of rules) {
        try {
            // Construct a single, powerful regex from the rule's markers.
            // This captures the amount and the person in one pass.
            // The `.*?` is a non-greedy match for any characters in between the markers.
            const fullPattern = new RegExp(
                escapeRegex(rule.amountStartsAfter) +
                '([\\d,.]+)' + // Capture group 1: The amount (digits, commas, dots)
                escapeRegex(rule.amountEndsBefore) +
                '.*?' + // Any characters between amount and person
                escapeRegex(rule.personStartsAfter) +
                '(.*?)' + // Capture group 2: The person's name
                escapeRegex(rule.personEndsBefore),
                'i' // Case-insensitive matching
            );

            const match = cleanedSms.match(fullPattern);

            if (match && match[1] && match[2]) {
                const amount = cleanAndParseFloat(match[1]);
                const person = match[2].trim();

                // Ensure we got valid data before returning
                if (!isNaN(amount) && person) {
                    return {
                        parsed: true,
                        type: rule.type,
                        amount,
                        person,
                    };
                }
            }
        } catch (e) {
            console.error(`Error applying custom rule "${rule.name}":`, e);
            continue; // Move to the next rule if this one fails
        }
    }
    
    // If no custom rules matched, return null
    return null;
}
