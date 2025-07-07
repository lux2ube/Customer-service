
'use server';
/**
 * @fileOverview An AI flow to parse SMS transaction messages.
 *
 * - parseSms - A function that parses an SMS message body into structured data.
 * - ParseSmsInput - The input type for the parseSms function.
 * - ParseSmsOutput - The return type for the parseSms function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const ParseSmsInputSchema = z.object({
  sms_body: z.string().describe('The raw SMS message content to be parsed.'),
  deposit_example: z.string().describe('An example of a deposit SMS message for pattern matching.'),
  withdraw_example: z.string().describe('An example of a withdrawal SMS message for pattern matching.'),
  identity_source: z.string().describe('The rule for how to extract the client identifier from the SMS body. Can be one of "phone_number", "first_last_name", "first_second_name", "partial_name".'),
});
export type ParseSmsInput = z.infer<typeof ParseSmsInputSchema>;

const ParseSmsOutputSchema = z.object({
  type: z.enum(['deposit', 'withdraw', 'unknown']).describe('The type of transaction determined from the SMS.'),
  amount: z.number().describe('The numerical amount of the transaction.'),
  client_identifier: z.string().describe("The name or identifier of the client extracted from the SMS based on the identity_source rule. If the rule is 'phone_number', this should be an empty string."),
});
export type ParseSmsOutput = z.infer<typeof ParseSmsOutputSchema>;

const prompt = ai.definePrompt({
  name: 'parseSmsPrompt',
  input: { schema: ParseSmsInputSchema },
  output: { schema: ParseSmsOutputSchema },
  prompt: `You are an expert at parsing structured text from SMS messages. You will be given an SMS message body, and two examples: one for a deposit and one for a withdrawal.

Your task is to:
1.  Determine if the SMS is a deposit, a withdrawal, or neither, by comparing it to the provided examples. Set the 'type' field accordingly.
2.  Extract the numerical transaction amount. Be careful to extract only the numbers, ignoring currency symbols or commas. Set the 'amount' field.
3.  Extract the client's identity from the SMS based on the provided identity source rule. Set the 'client_identifier' field.

Identity Source Rule: {{{identity_source}}}
This rule tells you how to find the client's name or identifier.
- "phone_number": This is a special case. You don't need to extract anything from the SMS body for the client's identity. You should return an empty string for the client_identifier, as the system will use the sender's phone number.
- "first_last_name": The client's name is two words, representing their first and last name. Extract these two words.
- "first_second_name": The client's name is two words, representing their first and second name. Extract these two words.
- "partial_name": The client's name is a single word or a part of their full name. Extract it.

Deposit Example:
"{{{deposit_example}}}"

Withdrawal Example:
"{{{withdraw_example}}}"

SMS to Parse:
"{{{sms_body}}}"

Provide the output in the specified JSON format. If you cannot determine the type or extract a valid numerical amount, set the type to 'unknown' and the amount to 0. If you cannot extract a client identifier based on the rule, return an empty string for it.`,
});

const parseSmsFlow = ai.defineFlow(
  {
    name: 'parseSmsFlow',
    inputSchema: ParseSmsInputSchema,
    outputSchema: ParseSmsOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

export async function parseSms(input: ParseSmsInput): Promise<ParseSmsOutput> {
  return parseSmsFlow(input);
}
