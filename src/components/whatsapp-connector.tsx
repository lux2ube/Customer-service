
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
    const [status, setStatus] = useState<WhatsAppStatus>('DISCONNECTED');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    
    // Use a ref for the interval to avoid issues with stale state in closures
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    const checkStatus = useCallback(async () => {
        try {
            const result = await getWhatsAppClientStatus();
            setStatus(result.status);
            setQrCode(result.qrCodeDataUrl);
        } catch (error) {
            console.error("Failed to get WhatsApp status:", error);
            // If the check fails, assume disconnected to be safe
            setStatus('DISCONNECTED');
        }
    }, []);

    // Effect to manage the polling interval
    useEffect(() => {
        // Function to start polling
        const startPolling = () => {
            if (intervalRef.current) return; // Already polling
            intervalRef.current = setInterval(checkStatus, 3000); // Poll every 3 seconds
        };

        // Function to stop polling
        const stopPolling = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        // Start polling if we are not connected.
        if (status !== 'CONNECTED') {
            startPolling();
        } else {
            // Stop polling if we are connected.
            setIsConnecting(false);
            stopPolling();
        }
        
        // Cleanup function to clear interval when component unmounts
        return () => stopPolling();
    }, [status, checkStatus]);
    
    // Initial status check on component mount
    useEffect(() => {
        checkStatus();
    }, [checkStatus]);


    const handleConnect = async () => {
        setIsConnecting(true);
        setStatus('CONNECTING');
        try {
            await initializeWhatsAppClient();
            // After initializing, do an immediate check
            await checkStatus();
        } catch (error) {
            console.error("Failed to initialize WhatsApp client:", error);
            setStatus('DISCONNECTED');
            setIsConnecting(false);
        }
    };

    const getStatusContent = () => {
        switch (status) {
            case 'DISCONNECTED':
                return (
                    <>
                        <CardDescription>
                            Your server is not connected to WhatsApp. Click the button to begin the connection process.
                        </CardDescription>
                        <Button onClick={handleConnect} disabled={isConnecting} className="mt-4">
                            {isConnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Connect to WhatsApp
                        </Button>
                    </>
                );
            case 'CONNECTING':
                return (
                     <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>
                            Initializing client... This may take a moment.
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
                        <p className="text-xs text-muted-foreground">Waiting for scan. A new code will appear if this one expires.</p>
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
