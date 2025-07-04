import { PageHeader } from "@/components/page-header";
import { LeadProfileForm } from "@/components/lead-profile-form";
import { Lead } from "@/lib/types";

export default function NewLeadPage() {
    const newLead: Lead = {
        id: '',
        name: '',
        email: '',
        phone: '',
        source: '',
        status: 'New',
        created_at: '',
    };

    return (
        <>
            <PageHeader
                title="Add New Lead"
                description="Fill in the details to create a new lead."
            />
            <div className="space-y-6">
                <LeadProfileForm lead={newLead} isCreating={true} />
            </div>
        </>
    );
}
