'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting relevant labels for a customer based on their profile details.
 *
 * - suggestCustomerLabels - A function that takes customer profile details and returns a list of suggested labels.
 * - SuggestCustomerLabelsInput - The input type for the suggestCustomerLabels function.
 * - SuggestCustomerLabelsOutput - The return type for the suggestCustomerLabels function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestCustomerLabelsInputSchema = z.object({
  customerProfile: z
    .string()
    .describe('The profile details of the customer, including their demographics, purchase history, and interactions with the company.'),
  availableLabels: z
    .array(z.string())
    .describe('A list of available labels that can be assigned to the customer.'),
});
export type SuggestCustomerLabelsInput = z.infer<typeof SuggestCustomerLabelsInputSchema>;

const SuggestCustomerLabelsOutputSchema = z.object({
  suggestedLabels: z
    .array(z.string())
    .describe('A list of labels suggested for the customer, based on their profile details.'),
  reasoning: z
    .string()
    .describe('Explanation of why each label was suggested, referencing specific details from the customer profile.'),
});
export type SuggestCustomerLabelsOutput = z.infer<typeof SuggestCustomerLabelsOutputSchema>;

export async function suggestCustomerLabels(
  input: SuggestCustomerLabelsInput
): Promise<SuggestCustomerLabelsOutput> {
  return suggestCustomerLabelsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestCustomerLabelsPrompt',
  input: {schema: SuggestCustomerLabelsInputSchema},
  output: {schema: SuggestCustomerLabelsOutputSchema},
  prompt: `You are an expert CRM assistant. Given a customer profile and a list of available labels, you will suggest the most relevant labels for the customer.

Customer Profile:
{{{customerProfile}}}

Available Labels:
{{#each availableLabels}}- {{{this}}}\n{{/each}}

For each suggested label, explain why it is relevant to the customer, referencing specific details from the customer profile.

Output should be in JSON format.
`,
});

const suggestCustomerLabelsFlow = ai.defineFlow(
  {
    name: 'suggestCustomerLabelsFlow',
    inputSchema: SuggestCustomerLabelsInputSchema,
    outputSchema: SuggestCustomerLabelsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
