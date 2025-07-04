export interface Client {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
    created_at: string;
    avatarUrl: string;
}

export interface Lead {
    id: string;
    name: string;
    email: string;
    phone: string;
    source: string;
    status: 'New' | 'Contacted' | 'Qualified' | 'Unqualified';
    created_at: string;
}
