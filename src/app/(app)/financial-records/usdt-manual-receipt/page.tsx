
import { PageHeader } from "@/components/page-header";
import { Suspense } from "react";
// import { UsdtManualReceiptForm } from "@/components/usdt-manual-receipt-form";
// We will create this form component in a subsequent step.
// For now, we create the page structure.

export default function UsdtManualReceiptPage() {
    return (
        <>
            <PageHeader
                title="USDT – Manual Receipt"
                description="Record receiving USDT from a client manually."
            />
            <Suspense fallback={<div>Loading form...</div>}>
               <div className="text-center text-muted-foreground p-8 border-dashed border-2 rounded-lg">
                    USDT Manual Receipt Form will be implemented here.
               </div>
            </Suspense>
        </>
    );
}
