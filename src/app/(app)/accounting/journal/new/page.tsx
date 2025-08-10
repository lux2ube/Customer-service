
import { PageHeader } from "@/components/page-header";
import { JournalEntryForm } from "@/components/journal-entry-form";

export default async function NewJournalEntryPage() {
    return (
        <>
            <PageHeader
                title="سند قيد جديد"
                description="تسجيل معاملة جديدة باستخدام مبادئ القيد المزدوج."
            />
            <JournalEntryForm />
        </>
    );
}
