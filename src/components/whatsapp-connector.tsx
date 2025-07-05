
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { getWhatsAppClientStatus, initializeWhatsAppClient } from '@/lib/actions';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Badge } from './ui/badge';

type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED' | 'CONNECTED';

export function WhatsAppConnector() {
    const [status, setStatus] = useState<WhatsAppStatus>('DISCONNECTED');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const checkStatus = useCallback(async () => {
        const result = await getWhatsAppClientStatus();
        if (result) {
            // This prevents the UI from flickering back to DISCONNECTED if the server is just slow
            if (status === 'CONNECTING' && result.status === 'DISCONNECTED') {
                return;
            }
            setStatus(result.status);
            setQrCode(result.qrCodeDataUrl);
        }
    }, [status]);

    useEffect(() => {
        // Initial check
        checkStatus();

        // Poll for status changes every 5 seconds
        const interval = setInterval(() => {
            // Only poll if not connected, to avoid unnecessary requests
            if (status !== 'CONNECTED') {
                 checkStatus();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [checkStatus, status]);

    useEffect(() => {
        if (status !== 'CONNECTING') {
            setIsLoading(false);
        }
        if (status === 'CONNECTING') {
            setIsLoading(true);
        }
    }, [status]);

    const handleConnect = () => {
        // Set loading state and let the polling handle UI updates
        setStatus('CONNECTING');
        initializeWhatsAppClient();
    };

    const getStatusContent = () => {
        switch (status) {
            case 'DISCONNECTED':
                return (
                    <>
                        <CardDescription>
                            Your server is not connected to WhatsApp. Click the button to begin the connection process.
                        </CardDescription>
                        <Button onClick={handleConnect} disabled={isLoading} className="mt-4">
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Connect to WhatsApp
                        </Button>
                    </>
                );
            case 'CONNECTING':
                return (
                     <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>
                            Initializing client... Please wait. This may take a moment.
                        </CardDescription>
                    </div>
                );
            case 'QR_REQUIRED':
                return (
                    <div className="flex flex-col items-center gap-4">
                        <CardDescription>
                            Scan this QR code with the WhatsApp app on your phone. (Link a device)
                        </CardDescription>
                        {qrCode ? (
                            <Image src={qrCode} alt="WhatsApp QR Code" width={250} height={250} className="rounded-lg border p-2 bg-white" />
                        ) : (
                            <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading QR Code...</span>
                            </div>
                        )}
                    </div>
                );
            case 'CONNECTED':
                return (
                    <CardDescription>
                        Your server is connected to WhatsApp and ready to send notifications.
                    </CardDescription>
                );
            default:
                return null;
        }
    };
    
    const getStatusBadgeVariant = () => {
        switch(status) {
            case 'CONNECTED': return 'default';
            case 'DISCONNECTED': return 'destructive';
            default: return 'secondary';
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>Connection Status</CardTitle>
                    <Badge variant={getStatusBadgeVariant()}>{status.replace('_', ' ')}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                {getStatusContent()}
            </CardContent>
        </Card>
    );
}
