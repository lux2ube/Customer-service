
import { PageHeader } from "@/components/page-header";
import { BscApiManager } from "@/components/bsc-api-manager";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { ref, get } from 'firebase/database';
import type { BscApiSetting, Account } from "@/lib/types";

async function getPageData(): Promise<{ apiSettings: BscApiSetting[], usdtAccounts: Account[] }> {
    const apiSettingsRef = ref(db, 'bsc_apis');
    const accountsRef = ref(db, 'accounts');
    
    const [apiSettingsSnapshot, accountsSnapshot] = await Promise.all([
        get(apiSettingsRef),
        get(accountsRef),
    ]);

    const apiSettings: BscApiSetting[] = apiSettingsSnapshot.exists() 
        ? Object.keys(apiSettingsSnapshot.val()).map(key => ({ id: key, ...apiSettingsSnapshot.val()[key] }))
        : [];
        
    const usdtAccounts: Account[] = accountsSnapshot.exists()
        ? Object.entries(accountsSnapshot.val())
            .filter(([key, acc]: [string, any]) => acc.currency === 'USDT' && !acc.isGroup)
            .map(([key, acc]: [string, any]) => ({ id: key, ...acc })) as Account[]
        : [];

    return { apiSettings, usdtAccounts };
}

export default async function BscApiSettingsPage() {
    const { apiSettings, usdtAccounts } = await getPageData();
    return (
        <>
            <PageHeader
                title="BSC API Settings"
                description="Manage Etherscan API v2 keys for BSC (Binance Smart Chain) transaction monitoring. Get your API key from etherscan.io."
            />
            <Suspense fallback={<div>Loading...</div>}>
                <BscApiManager initialSettings={apiSettings} usdtAccounts={usdtAccounts} />
            </Suspense>
        </>
    );
}
