import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

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
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm h-full">
                <div className="flex flex-col items-center gap-1 text-center">
                    <h3 className="text-2xl font-bold tracking-tight">
                        Client module is being restored.
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        Client data will be displayed here.
                    </p>
                </div>
            </div>
        </>
    );
}
