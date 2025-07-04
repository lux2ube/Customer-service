import { PageHeader } from "@/components/page-header";
import { CustomerProfileForm } from "@/components/customer-profile-form";
import { getLabels } from "@/lib/data";
import { Customer } from "@/lib/types";

export default async function NewCustomerPage() {
    const labels = await getLabels();

    // Create a blank customer object for the form
    const newCustomer: Customer = {
        id: '',
        name: '',
        email: '',
        phone: '',
        address: '',
        notes: '',
        labels: [],
        createdAt: '',
        lastSeen: '',
        avatarUrl: 'https://placehold.co/100x100.png',
    };

    return (
        <>
            <PageHeader
                title="Add New Customer"
                description="Fill in the details to create a new customer profile."
            />
            <div className="space-y-6">
                <CustomerProfileForm customer={newCustomer} allLabels={labels} isCreating={true} />
            </div>
        </>
    );
}
