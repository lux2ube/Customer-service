import { getCustomerById, getLabels } from "@/lib/data";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { CustomerProfileForm } from "@/components/customer-profile-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteCustomerDialog } from "@/components/delete-customer-dialog";
  

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
    const customer = await getCustomerById(params.id);
    const labels = await getLabels();

    if (!customer) {
        notFound();
    }

    return (
        <>
            <PageHeader 
                title={customer.name}
                description={`Customer since ${new Date(customer.createdAt).toLocaleDateString()}`}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem>Add to List</DropdownMenuItem>
                        <DeleteCustomerDialog customerId={customer.id}>
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                Delete Customer
                            </DropdownMenuItem>
                        </DeleteCustomerDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </PageHeader>
            <div className="space-y-6">
                <CustomerProfileForm customer={customer} allLabels={labels} />
            </div>
        </>
    );
}
