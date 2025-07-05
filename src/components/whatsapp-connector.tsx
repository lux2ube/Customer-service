
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { getWhatsAppClientStatus, initializeWhatsAppClient, logoutWhatsAppClient } from '@/lib/actions';
import { Loader2, LogOut } from 'lucide-react';
import Image from 'next/image';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

type WhatsAppStatus = 'DISCONNECTED' | 'CONNECTING' | 'GENERATING_QR' | 'QR_REQUIRED' | 'CONNECTED';

export function WhatsAppConnector() {
    const [serverStatus, setServerStatus] = useState<WhatsAppStatus | 'INITIALIZING'>('INITIALIZING');
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [lastError, setLastError] = useState<string | null>(null);
    const [isConnectActionRunning, setIsConnectActionRunning] = useState(false);
    const [isLogoutActionRunning, setIsLogoutActionRunning] = useState(false);
    const intervalRef = useRef<NodeJS.Timeout>();

    const handleConnect = async () => {
        if (isConnectActionRunning) return;
        setIsConnectActionRunning(true);
        try {
            await initializeWhatsAppClient();
        } catch (error) {
            console.error("Error initiating connection:", error);
        } finally {
            setIsConnectActionRunning(false);
        }
    };

    const handleLogout = async () => {
        if (isLogoutActionRunning) return;
        setIsLogoutActionRunning(true);
        try {
            await logoutWhatsAppClient();
            // Polling will handle the status update
        } catch (error) {
            console.error("Error logging out:", error);
        } finally {
            setIsLogoutActionRunning(false);
        }
    };

    useEffect(() => {
        const pollStatus = async () => {
            try {
                const result = await getWhatsAppClientStatus();
                setServerStatus(result.status);
                setQrCode(result.qrCodeDataUrl);
                setLastError(result.lastError);
            } catch (e) {
                console.error("Failed to get WhatsApp status:", e);
                setServerStatus('DISCONNECTED');
            }
        };

        pollStatus(); // Initial check
        intervalRef.current = setInterval(pollStatus, 2500); // Poll every 2.5 seconds

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const getStatusContent = () => {
        switch (serverStatus) {
            case 'INITIALIZING':
            case 'CONNECTING':
                return (
                     <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>
                           {serverStatus === 'INITIALIZING' ? 'Checking connection status...' : 'Connecting to WhatsApp...'}
                        </CardDescription>
                    </div>
                );
            case 'DISCONNECTED':
                return (
                    <div className="flex flex-col items-center text-center">
                        {lastError && (
                            <Alert variant="destructive" className="mb-4">
                                <AlertTitle>Connection Failed</AlertTitle>
                                <AlertDescription>{lastError}</AlertDescription>
                            </Alert>
                        )}
                        <CardDescription>
                            Your server is not connected to WhatsApp. Click the button to begin the connection process.
                        </CardDescription>
                        <Button onClick={handleConnect} className="mt-4" disabled={isConnectActionRunning}>
                            {isConnectActionRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Connect to WhatsApp
                        </Button>
                    </div>
                );
             case 'GENERATING_QR':
                return (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <CardDescription>
                           Generating QR Code...
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
        switch(serverStatus) {
            case 'CONNECTED': return 'default';
            case 'DISCONNECTED': return 'destructive';
            default: return 'secondary';
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start">
                    <CardTitle>Connection Status</CardTitle>
                    <div className="flex items-center gap-2">
                        <Badge variant={getStatusBadgeVariant()}>
                            {serverStatus === 'INITIALIZING' ? 'LOADING' : serverStatus.replace('_', ' ')}
                        </Badge>
                        {serverStatus !== 'CONNECTED' && serverStatus !== 'INITIALIZING' && (
                             <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleLogout}
                                disabled={isLogoutActionRunning}
                            >
                                {isLogoutActionRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                                Clear Session & Logout
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex justify-center items-center min-h-[250px]">
                {getStatusContent()}
            </CardContent>
        </Card>
    );
}
