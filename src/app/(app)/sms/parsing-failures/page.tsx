
import { PageHeader } from "@/components/page-header";
import { SmsParsingFailuresTable } from "@/components/sms-parsing-failures-table";

export default function SmsParsingFailuresPage() {
    return (
        <>
            <PageHeader
                title="SMS Parsing Failures"
                description="Review SMS messages that the system could not automatically parse and create records for them manually."
            />
            <SmsParsingFailuresTable />
        </>
    );
}
