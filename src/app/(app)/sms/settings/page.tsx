import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SmsSettingsPage() {
    return (
        <>
            <PageHeader
                title="SMS Settings"
                description="Configure your SMS gateway and message templates."
            />
            <Card>
                <CardHeader>
                    <CardTitle>Coming Soon</CardTitle>
                    <CardDescription>
                        This page will allow you to configure your SMS integration.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Settings for API keys, sender IDs, and message templates will be available here.</p>
                </CardContent>
            </Card>
        </>
    );
}
