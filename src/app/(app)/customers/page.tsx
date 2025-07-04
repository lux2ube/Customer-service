import { PageHeader } from "@/components/page-header";
import { CustomersTable } from "@/components/customers-table";
import { getCustomers, getLabels } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";

export default async function CustomersPage() {
    const customers = await getCustomers();
    const labels = await getLabels();

    return (
        <>
            <PageHeader 
                title="Customers"
                description="View, search, and manage your customers."
            >
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Customer
                </Button>
            </PageHeader>
            <CustomersTable customers={customers} labels={labels} />
        </>
    );
}
