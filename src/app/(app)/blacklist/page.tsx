
import { PageHeader } from "@/components/page-header";
import { BlacklistManager } from "@/components/blacklist-manager";

export default function BlacklistPage() {
    return (
        <>
            <PageHeader
                title="Blacklist Management"
                description="Manage names, phone numbers, and addresses to be flagged during client and transaction creation."
            />
            <BlacklistManager />
        </>
    );
}
