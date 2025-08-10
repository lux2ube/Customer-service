
import { PageHeader } from "@/components/page-header";
import { JournalTable } from "@/components/journal-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function JournalPage() {
    return (
        <>
            <PageHeader 
                title="دفتر اليومية (Journal Entries)"
                description="تسجيل وعرض جميع المعاملات المالية."
            >
                <Button asChild>
                    <Link href="/accounting/journal/new">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        سند قيد جديد
                    </Link>
                </Button>
            </PageHeader>
            <JournalTable />
        </>
    );
}
