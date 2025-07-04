'use server';

import { suggestCustomerLabels } from '@/ai/flows/suggest-customer-labels';
import { Customer, Label } from './types';

export async function getAiSuggestions(customer: Customer, availableLabels: Label[]) {
    try {
        const customerProfile = `
            Name: ${customer.name}
            Email: ${customer.email}
            Customer Since: ${customer.createdAt}
            Last Seen: ${customer.lastSeen}
            Phone: ${customer.phone || 'N/A'}
            Address: ${customer.address || 'N/A'}
            Notes: ${customer.notes || 'N/A'}
        `;

        const labelNames = availableLabels.map(label => label.name);

        const result = await suggestCustomerLabels({
            customerProfile,
            availableLabels: labelNames,
        });

        return { success: true, data: result };

    } catch (error) {
        console.error('Error getting AI suggestions:', error);
        return { success: false, error: 'Failed to get AI suggestions.' };
    }
}
