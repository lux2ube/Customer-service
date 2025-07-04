import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "@/components/clients-table";

export default function ClientsPage() {
    return (
        <>
            <PageHeader 
                title="Clients"
                description="Manage customer profiles and history."
            >
                <Button asChild>
                    <Link href="/clients/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Client
                    </Link>
                </Button>
            </PageHeader>
            <ClientsTable />
        </>
    );
}
