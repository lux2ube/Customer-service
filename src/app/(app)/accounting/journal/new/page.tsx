
import { PageHeader } from "@/components/page-header";
import { JournalEntryForm } from "@/components/journal-entry-form";

export default async function NewJournalEntryPage() {
    return (
        <>
            <PageHeader
                title="New Internal Transfer"
                description="Record a transaction between two internal accounts using double-entry principles."
            />
            <JournalEntryForm />
        </>
    );
}
