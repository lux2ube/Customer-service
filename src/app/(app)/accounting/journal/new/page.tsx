import { PageHeader } from "@/components/page-header";
import { JournalEntryForm } from "@/components/journal-entry-form";

export default async function NewJournalEntryPage() {
    return (
        <>
            <PageHeader
                title="New Journal Entry"
                description="Record a new transaction using double-entry principles."
            />
            <JournalEntryForm />
        </>
    );
}
