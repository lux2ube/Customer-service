
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function TelegramPage() {
    const { toast } = useToast();
    const [webhookUrl, setWebhookUrl] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        // Construct the webhook URL dynamically based on the current window location.
        // This ensures it works correctly in development, production, and preview environments.
        if (typeof window !== 'undefined') {
            const url = `${window.location.origin}/api/telegram`;
            setWebhookUrl(url);
        }
        setLoading(false);
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText(webhookUrl);
        toast({
            title: "Webhook URL Copied",
            description: "The URL has been copied to your clipboard.",
        });
    };

    return (
        <>
            <PageHeader
                title="Telegram Bot Integration"
                description="Connect your Telegram bot to interact with your clients."
            />
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Setup Instructions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Step 1: Get your Bot Token</h3>
                            <p className="text-sm text-muted-foreground">
                                Talk to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary underline">@BotFather</a> on Telegram to create a new bot. It will give you a unique token.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold">Step 2: Save your Token</h3>
                            <p className="text-sm text-muted-foreground">
                                Go to the <Link href="/settings" className="text-primary underline">Settings page</Link> and paste your Telegram Bot Token into the designated field and save.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold">Step 3: Set your Webhook</h3>
                            <p className="text-sm text-muted-foreground">
                                Copy the webhook URL below and provide it to @BotFather using the <code>/setwebhook</code> command. This tells Telegram where to send messages.
                            </p>
                            <div className="space-y-2 pt-2">
                                <Label htmlFor="webhookUrl">Your Unique Webhook URL</Label>
                                <div className="flex items-center space-x-2">
                                    {loading ? (
                                        <Skeleton className="h-8 w-full" />
                                    ) : (
                                        <Input id="webhookUrl" value={webhookUrl} readOnly />
                                    )}
                                    <Button variant="outline" size="icon" onClick={handleCopy} disabled={loading}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    This URL is the bridge between your app and the Telegram bot.
                                </p>
                            </div>
                        </div>
                         <div className="space-y-2">
                            <h3 className="font-semibold">Step 4: Configure Bot Commands (Optional)</h3>
                            <p className="text-sm text-muted-foreground">
                                In @BotFather, use the <code>/setcommands</code> command to provide a list of available actions for your users. A good starting point is:
                            </p>
                             <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto"><code>start - Start interacting with the bot</code></pre>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
