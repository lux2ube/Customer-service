
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import { MessageCircle } from 'lucide-react';
import type { Transaction, Client } from '@/lib/types';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface WhatsAppLinkGeneratorProps {
    transaction: Transaction;
    client: Client | null;
}

export function WhatsAppLinkGenerator({ transaction, client }: WhatsAppLinkGeneratorProps) {
    if (!client || !client.phone) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle>WhatsApp Invoice</CardTitle>
                    <CardDescription>Generate a pre-filled WhatsApp message link for this transaction.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">Client phone number not available. Cannot generate WhatsApp link.</p>
                </CardContent>
            </Card>
        );
    }

    const handleGenerateLink = () => {
        const formatCurrency = (value: number) => {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
        }

        const messageParts = [
            `*Invoice for Transaction*`,
            `--------------------`,
            `Date: ${format(new Date(transaction.date), 'PPP')}`,
            `Client: ${transaction.clientName || client.name}`,
            `Type: ${transaction.type}`,
            `Amount: ${new Intl.NumberFormat().format(transaction.amount)} ${transaction.currency}`,
            `Amount (USD): ${formatCurrency(transaction.amount_usd)}`,
            `Status: ${transaction.status}`,
        ];

        if (transaction.hash) {
            messageParts.push(`Hash: ${transaction.hash}`);
        }

        if (transaction.remittance_number) {
            messageParts.push(`Remittance #: ${transaction.remittance_number}`);
        }
        
        messageParts.push(`--------------------`);
        messageParts.push(`Thank you!`);
        
        const message = messageParts.join('\n');
        const encodedMessage = encodeURIComponent(message);
        // Remove non-digit characters from the phone number
        const phoneNumber = client.phone.replace(/\D/g, ''); 
        
        const url = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
        
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
         <Card>
            <CardHeader>
                <CardTitle>WhatsApp Invoice</CardTitle>
                <CardDescription>Generate a pre-filled WhatsApp message link for this transaction.</CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleGenerateLink} className="w-full">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Generate WhatsApp Link
                </Button>
            </CardContent>
        </Card>
    );
}
