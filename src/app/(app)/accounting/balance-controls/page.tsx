import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';
import { BalanceControlsForm } from '@/components/balance-controls-form';

async function getAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    
    if (!snapshot.exists()) {
        return [];
    }
    
    const data = snapshot.val();
    const accounts: Account[] = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
    }));
    
    return accounts
        .filter(acc => !acc.isGroup)
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export default async function BalanceControlsPage() {
    const accounts = await getAccounts();
    
    return (
        <div className="container mx-auto py-6 max-w-3xl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Balance Controls</h1>
                <p className="text-muted-foreground">
                    Set closing and opening balances for accounts. This is used to start a fresh period or correct account balances.
                </p>
            </div>
            
            <BalanceControlsForm accounts={accounts} />
        </div>
    );
}
