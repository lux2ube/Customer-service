import { PageHeader } from "@/components/page-header";
import { WalletView } from "@/components/wallet-page";
import { Suspense } from "react";

export default async function WalletPage() {
    return (
        <>
            <PageHeader
                title="USDT Sender Wallet"
                description="Manage your sender wallet and send USDT to clients."
            />
            <Suspense fallback={<div>Loading Wallet...</div>}>
                <WalletView />
            </Suspense>
        </>
    );
}
