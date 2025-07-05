import { PageHeader } from "@/components/page-header";
import { WhatsAppConnector } from "@/components/whatsapp-connector";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";

export default function WhatsAppPage() {
    return (
        <>
            <PageHeader
                title="WhatsApp Integration"
                description="Connect your account to send transaction notifications."
            />
            <Alert>
                <Terminal className="h-4 w-4" />
                <AlertTitle>Important Note</AlertTitle>
                <AlertDescription>
                    This feature uses an unofficial API and relies on WhatsApp Web. It may be unstable and could stop working if WhatsApp updates its platform. Use at your own discretion. Session data is stored locally on the server.
                </AlertDescription>
            </Alert>
            <div className="mt-6">
                <WhatsAppConnector />
            </div>
        </>
    );
}
