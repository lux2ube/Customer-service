import { PageHeader } from "@/components/page-header";
import { LeadsTable } from "@/components/leads-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function LeadsPage() {
    return (
        <>
            <PageHeader 
                title="Leads"
                description="Track potential customers before they convert."
            >
                <Button asChild>
                    <Link href="/leads/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Lead
                    </Link>
                </Button>
            </PageHeader>
            <LeadsTable />
        </>
    );
}
