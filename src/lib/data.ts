import type { Customer, Label, CustomList } from './types';

export const labels: Label[] = [
  { id: 'l1', name: 'VIP', color: '#FFD700' },
  { id: 'l2', name: 'New Lead', color: '#00C49F' },
  { id: 'l3', name: 'Churn Risk', color: '#FF8042' },
  { id: 'l4', name: 'High Value', color: '#8884d8' },
  { id: 'l5', name: 'Inactive', color: '#b0b0b0' },
];

export const customers: Customer[] = [
  {
    id: 'c1',
    name: 'Alice Johnson',
    email: 'alice.j@example.com',
    createdAt: '2023-01-15',
    lastSeen: '2024-07-20',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l1', 'l4'],
    phone: '123-456-7890',
    address: '123 Maple St, Springfield',
    notes: 'Interested in Q4 product launch. Follow up in September.'
  },
  {
    id: 'c2',
    name: 'Bob Williams',
    email: 'bob.w@example.com',
    createdAt: '2023-03-22',
    lastSeen: '2024-07-18',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l2'],
    phone: '234-567-8901',
  },
  {
    id: 'c3',
    name: 'Charlie Brown',
    email: 'charlie.b@example.com',
    createdAt: '2022-11-30',
    lastSeen: '2024-05-10',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l3', 'l5'],
    address: '456 Oak Ave, Metropolis',
    notes: 'Contract renewal due in December. Has expressed budget concerns.'
  },
  {
    id: 'c4',
    name: 'Diana Prince',
    email: 'diana.p@example.com',
    createdAt: '2023-08-10',
    lastSeen: '2024-07-21',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l1', 'l2', 'l4'],
  },
  {
    id: 'c5',
    name: 'Ethan Hunt',
    email: 'ethan.h@example.com',
    createdAt: '2024-02-28',
    lastSeen: '2024-07-15',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l2'],
    phone: '567-890-1234',
    notes: 'Met at the trade show. Very interested in our enterprise solution.'
  },
  {
    id: 'c6',
    name: 'Fiona Gallagher',
    email: 'fiona.g@example.com',
    createdAt: '2021-06-01',
    lastSeen: '2024-07-19',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l4'],
    address: '789 Pine Ln, Gotham'
  },
  {
    id: 'c7',
    name: 'George Constanza',
    email: 'george.c@example.com',
    createdAt: '2023-09-05',
    lastSeen: '2024-04-01',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: ['l5'],
    notes: 'No response to recent emails. Needs re-engagement.'
  },
  {
    id: 'c8',
    name: 'Hannah Abbott',
    email: 'hannah.a@example.com',
    createdAt: '2024-01-20',
    lastSeen: '2024-06-30',
    avatarUrl: 'https://placehold.co/40x40.png',
    labels: [],
  }
];

export const customLists: CustomList[] = [
  { id: 'list1', name: 'Q4 Follow-ups', customerIds: ['c1', 'c5'] },
  { id: 'list2', name: 'High-Priority Renewals', customerIds: ['c3'] },
  { id: 'list3', name: '2024 New Leads', customerIds: ['c2', 'c4', 'c5', 'c8'] },
];

// --- API Functions ---

export async function getCustomers(): Promise<Customer[]> {
  // In a real app, this would be a database query.
  return Promise.resolve(customers);
}

export async function getCustomerById(id: string): Promise<Customer | undefined> {
  return Promise.resolve(customers.find(c => c.id === id));
}

export async function getLabels(): Promise<Label[]> {
  return Promise.resolve(labels);
}

export async function getLabelById(id: string): Promise<Label | undefined> {
  return Promise.resolve(labels.find(l => l.id === id));
}

export async function getLists(): Promise<CustomList[]> {
    return Promise.resolve(customLists);
}

export async function getDashboardData() {
    const customerCount = customers.length;
    const labelsData = await getLabels();
    
    const distribution = labelsData.map(label => ({
        name: label.name,
        value: customers.filter(c => c.labels.includes(label.id)).length
    }));
    
    const newCustomersThisMonth = customers.filter(c => {
        const createdAt = new Date(c.createdAt);
        const now = new Date();
        return createdAt.getMonth() === now.getMonth() && createdAt.getFullYear() === now.getFullYear();
    }).length;

    return Promise.resolve({
        customerCount,
        distribution,
        newCustomersThisMonth,
        listsCount: customLists.length,
    });
}
