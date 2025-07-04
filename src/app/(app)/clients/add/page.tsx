import { PageHeader } from "@/components/page-header";
import { ClientForm } from "@/components/client-form";
import { Suspense } from "react";

export default async function AddClientPage() {
    return (
        <>
            <PageHeader
                title="Add Client"
                description="Create a new client profile."
            />
            <Suspense fallback={<div>Loading form...</div>}>
                <ClientForm />
            </Suspense>
        </>
    );
}
