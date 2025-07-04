import { Customer, Label, List } from './types';
import { subDays, formatISO } from 'date-fns';

let labels: Label[] = [
    { id: 'l1', name: 'VIP', color: '#ffd700' },
    { id: 'l2', name: 'New Lead', color: '#87ceeb' },
    { id: 'l3', name: 'Churn Risk', color: '#ff4500' },
    { id: 'l4', name: 'Whale', color: '#9370db' },
];

let customers: Customer[] = [
    {
        id: 'c1',
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '123-456-7890',
        address: '123 Main St, Anytown, USA',
        notes: 'Initial contact made. Follow up next week.',
        labels: ['l2'],
        createdAt: formatISO(subDays(new Date(), 30)),
        lastSeen: formatISO(subDays(new Date(), 2)),
        avatarUrl: 'https://placehold.co/100x100.png',
    },
    {
        id: 'c2',
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        phone: '987-654-3210',
        address: '456 Oak Ave, Somecity, USA',
        notes: 'Met at conference. Interested in Product X.',
        labels: ['l1', 'l4'],
        createdAt: formatISO(subDays(new Date(), 120)),
        lastSeen: formatISO(subDays(new Date(), 1)),
        avatarUrl: 'https://placehold.co/100x100.png',
    },
    {
        id: 'c3',
        name: 'Sam Wilson',
        email: 'sam.wilson@example.com',
        phone: '555-123-4567',
        address: '789 Pine Ln, Otherville, USA',
        notes: 'Long-time customer. Very satisfied.',
        labels: ['l1'],
        createdAt: formatISO(subDays(new Date(), 730)),
        lastSeen: formatISO(subDays(new Date(), 10)),
        avatarUrl: 'https://placehold.co/100x100.png',
    },
    {
        id: 'c4',
        name: 'Emily Brown',
        email: 'emily.brown@example.com',
        phone: '555-987-6543',
        address: '101 Maple Dr, Anotherton, USA',
        notes: 'Has not responded to recent emails. Potential churn risk.',
        labels: ['l3'],
        createdAt: formatISO(subDays(new Date(), 90)),
        lastSeen: formatISO(subDays(new Date(), 45)),
        avatarUrl: 'https://placehold.co/100x100.png',
    },
    {
        id: 'c5',
        name: 'Michael Johnson',
        email: 'michael.j@example.com',
        phone: '555-555-5555',
        address: '210 Birch Rd, Townsville, USA',
        notes: '',
        labels: [],
        createdAt: formatISO(subDays(new Date(), 5)),
        lastSeen: formatISO(subDays(new Date(), 5)),
        avatarUrl: 'https://placehold.co/100x100.png',
    },
];

let lists: List[] = [
    { id: 'list1', name: 'Q1 VIPs', customerIds: ['c2', 'c3'] },
    { id: 'list2', name: 'Conference Leads', customerIds: ['c1', 'c2'] },
];

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getCustomers(): Promise<Customer[]> {
    await delay(50);
    return customers.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
    await delay(50);
    return customers.find(c => c.id === id);
}

export async function getLabels(): Promise<Label[]> {
    await delay(50);
    return labels;
}

export async function getLists(): Promise<List[]> {
    await delay(50);
    return lists;
}

export async function updateCustomer(customerData: Customer): Promise<Customer> {
    await delay(100);
    const index = customers.findIndex(c => c.id === customerData.id);
    if (index !== -1) {
        customers[index] = { ...customers[index], ...customerData };
        return customers[index];
    }
    throw new Error("Customer not found");
}

export async function createCustomer(customerData: Omit<Customer, 'id' | 'createdAt' | 'lastSeen'>): Promise<Customer> {
    await delay(100);
    const newId = `c${Math.max(...customers.map(c => parseInt(c.id.substring(1))), 0) + 1}`;
    const newCustomer: Customer = {
        ...customerData,
        id: newId,
        createdAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
    };
    customers.push(newCustomer);
    return newCustomer;
}

export async function deleteCustomer(id: string): Promise<{ success: boolean }> {
    await delay(100);
    const initialLength = customers.length;
    customers = customers.filter(c => c.id !== id);
    // Also remove from lists
    lists.forEach(list => {
        list.customerIds = list.customerIds.filter(customerId => customerId !== id);
    });
    return { success: customers.length < initialLength };
}
