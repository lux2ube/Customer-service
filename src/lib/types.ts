export interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    notes: string;
    labels: string[]; // array of label IDs
    createdAt: string;
    lastSeen: string;
    avatarUrl: string;
}

export interface Label {
    id: string;
    name: string;
    color: string; // hex color
}

export interface List {
    id: string;
    name: string;
    customerIds: string[]; // array of customer IDs
}
