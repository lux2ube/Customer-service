
import { PageHeader } from "@/components/page-header";
import { JournalTable } from "@/components/journal-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function JournalPage() {
    return (
        <>
            <PageHeader 
                title="Internal Transfers (Journal Entries)"
                description="View all internal financial movements between accounts."
            >
                <Button asChild>
                    <Link href="/accounting/journal/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        New Internal Transfer
                    </Link>
                </Button>
            </PageHeader>
            <JournalTable />
        </>
    );
}
