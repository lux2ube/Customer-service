import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SmsTransactionsPage() {
    return (
        <>
            <PageHeader
                title="SMS Transactions"
                description="View and manage SMS-based transactions."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Coming Soon</CardTitle>
                    <CardDescription>
                        This page will display a table of all transactions initiated or confirmed via SMS.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>SMS transaction logging and management functionality will be implemented here.</p>
                </CardContent>
            </Card>
        </>
    );
}
