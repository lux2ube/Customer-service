export interface Client {
    id: string;
    name: string;
    phone: string;
    kycDocumentUrl?: string;
    verificationStatus: 'Active' | 'Inactive';
    reviewFlags: {
        aml: boolean;
        volume: boolean;
        scam: boolean;
    };
    created_at: string;
    avatarUrl: string;
}

export interface Transaction {
    id: string;
    createdAt: string;
    type: 'Deposit' | 'Withdraw';
    clientId: string;
    clientName: string; // Denormalized for easy display in tables
    amount: number;
    status: 'Pending' | 'Confirmed' | 'Cancelled';
}

// Placeholder for future implementation
export interface BankAccount {
    id: string;
    // ... other fields
}
