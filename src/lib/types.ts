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

// Placeholder for future implementation
export interface Transaction {
    id: string;
    // ... other fields
}

// Placeholder for future implementation
export interface BankAccount {
    id: string;
    // ... other fields
}
