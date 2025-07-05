
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { getWhatsAppClientStatus, initializeWhatsAppClient } from '@/lib/actions';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Badge } from './ui/badge';

type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'QR_REQUIRED' | 'CONNECTED';

export function WhatsAppConnector() {
    const [status, setStatus] = useState<WhatsAppStatus | 'INITIALIZING'>('INITIALIZING');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const intervalRef = useRef<NodeJS.Timeout>();

    const checkStatus = useCallback(async () => {
        try {
            const result = await getWhatsAppClientStatus();
            setStatus(result.status);
            setQrCode(result.qrCodeDataUrl);

            // If we are connected, we can stop polling.
            if (result.status === 'CONNECTED' && intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        } catch (error) {
            console.error("Failed to get WhatsApp status:", error);
            setStatus('DISCONNECTED');
        }
    }, []);

    const handleConnect = useCallback(async () => {
        // Don't do anything if we are already in the process of connecting
        if (status === 'CONNECTING' || status === 'QR_REQUIRED') return;
        
        setStatus('CONNECTING');
        try {
            await initializeWhatsAppClient();
            await checkStatus(); // Check status immediately

            // If polling was stopped (e.g., after being connected), restart it
            if (!intervalRef.current) {
                intervalRef.current = setInterval(checkStatus, 3000);
            }
        } catch (error) {
            console.error("Failed to initialize WhatsApp client:", error);
            setStatus('DISCONNECTED');
        }
    }, [checkStatus, status]);

    // This effect runs only once on mount to set up the polling.
    useEffect(() => {
        checkStatus(); // Initial check
        intervalRef.current = setInterval(checkStatus, 3000);

        // Cleanup on component unmount
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [checkStatus]);


    const getStatusContent = () => {
        switch (status) {
            case 'INITIALIZING':
            case 'CONNECTING':
                return (
                     <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>
                           {status === 'INITIALIZING' ? 'Checking connection status...' : 'Initializing client...'}
                        </CardDescription>
                    </div>
                );
            case 'DISCONNECTED':
                return (
                    <div className="flex flex-col items-center">
                        <CardDescription>
                            Your server is not connected to WhatsApp. Click the button to begin the connection process.
                        </CardDescription>
                        <Button onClick={handleConnect} className="mt-4">
                            Connect to WhatsApp
                        </Button>
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
                        <p className="text-xs text-muted-foreground">Waiting for scan. The status will update automatically.</p>
                    </div>
                );
            case 'CONNECTED':
                return (
                    <CardDescription>
                        Your server is connected to WhatsApp and ready to send notifications.
                    </CardDescription>
                );
            default:
                return (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>Loading...</CardDescription>
                    </div>
                );
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
                    <Badge variant={getStatusBadgeVariant()}>
                        {status === 'INITIALIZING' ? 'LOADING' : status.replace('_', ' ')}
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="flex justify-center items-center min-h-[250px]">
                {getStatusContent()}
            </CardContent>
        </Card>
    );
}
