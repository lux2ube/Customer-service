
import { PageHeader } from "@/components/page-header";
import { LabelManager } from "@/components/label-manager";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { TransactionFlag } from '@/lib/types';

async function getLabels(): Promise<TransactionFlag[]> {
    const labelsRef = ref(db, 'labels');
    const snapshot = await get(labelsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({ id: key, ...data[key] }));
    }
    return [];
}

export default async function LabelsPage() {
    const labels = await getLabels();

    return (
        <>
            <PageHeader
                title="Label Management"
                description="Create, edit, and manage custom labels for your clients and transactions."
            />
            <Suspense fallback={<div>Loading...</div>}>
                <LabelManager initialLabels={labels} />
            </Suspense>
        </>
    );
}
