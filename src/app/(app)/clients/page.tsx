import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ClientsTable } from "@/components/clients-table";
import { ImportClientsButton } from "@/components/import-clients-button";

export default function ClientsPage() {
    return (
        <>
            <PageHeader 
                title="Clients"
                description="Manage customer profiles and history."
            >
                <div className="flex items-center gap-2">
                    <ImportClientsButton />
                    <Button asChild>
                        <Link href="/clients/add">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Client
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <ClientsTable />
        </>
    );
}
