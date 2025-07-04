import { PageHeader } from "@/components/page-header";
import { ClientsTable } from "@/components/clients-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function ClientsPage() {
    return (
        <>
            <PageHeader 
                title="Clients"
                description="View, search, and manage your clients in real-time."
            >
                <Button asChild>
                    <Link href="/clients/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Client
                    </Link>
                </Button>
            </PageHeader>
            <ClientsTable />
        </>
    );
}
