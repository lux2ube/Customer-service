
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";

export default function UsdtManualPaymentPage() {
    return (
        <>
            <PageHeader
                title="USDT – Manual Payment"
                description="Record sending USDT to a client manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <div className="text-center text-muted-foreground p-8 border-dashed border-2 rounded-lg">
                    USDT Manual Payment Form will be implemented here.
                </div>
            </Suspense>
        </>
    );
}
