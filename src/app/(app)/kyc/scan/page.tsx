import { IdScanner } from "@/components/id-scanner";
import { PageHeader } from "@/components/page-header";

export default function KycScanPage() {
    return (
        <>
            <PageHeader
                title="KYC Document Scan"
                description="Upload an image of a Yemeni ID card or passport to automatically extract information using our built-in OCR."
            />
            <IdScanner />
        </>
    );
}
