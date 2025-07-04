import { PageHeader } from "@/components/page-header";
import { getLabels } from "@/lib/data";
import { LabelManager } from "@/components/label-manager";

export default async function LabelsPage() {
    const labels = await getLabels();

    return (
        <>
            <PageHeader 
                title="Manage Labels"
                description="Create and organize labels to categorize your customers."
            />
            <LabelManager initialLabels={labels} />
        </>
    );
}
