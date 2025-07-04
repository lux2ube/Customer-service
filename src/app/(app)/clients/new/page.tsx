import { PageHeader } from "@/components/page-header";
import { ClientProfileForm } from "@/components/client-profile-form";
import { Client } from "@/lib/types";

export default function NewClientPage() {
    // Create a blank client object for the form
    const newClient: Client = {
        id: '',
        name: '',
        phone: '',
        verificationStatus: 'Inactive',
        reviewFlags: {
            aml: false,
            volume: false,
            scam: false,
        },
        created_at: '',
        avatarUrl: 'https://placehold.co/100x100.png',
    };

    return (
        <>
            <PageHeader
                title="Add New Client"
                description="Fill in the details to create a new client profile."
            />
            <div className="space-y-6">
                <ClientProfileForm client={newClient} isCreating={true} />
            </div>
        </>
    );
}
