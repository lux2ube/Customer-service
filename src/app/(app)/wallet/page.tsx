import { PageHeader } from "@/components/page-header";
import { WalletView } from "@/components/wallet-page";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Account } from '@/lib/types';

async function getUsdtAccounts(): Promise<Account[]> {
    const accountsRef = ref(db, 'accounts');
    const snapshot = await get(accountsRef);
    if (!snapshot.exists()) {
        return [];
    }
    const allAccounts: Record<string, Account> = snapshot.val();
    return Object.keys(allAccounts)
        .map(id => ({ id, ...allAccounts[id] }))
        .filter(acc => !acc.isGroup && acc.currency === 'USDT');
}


export default async function WalletPage() {
    const usdtAccounts = await getUsdtAccounts();
    return (
        <>
            <PageHeader
                title="USDT Sender Wallet"
                description="Manage your sender wallet and send USDT to clients."
            />
            <Suspense fallback={<div>Loading Wallet...</div>}>
                <WalletView usdtAccounts={usdtAccounts} />
            </Suspense>
        </>
    );
}
