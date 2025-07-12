
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Button } from "./ui/button";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Download, Share2, User, Wallet, Hash } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import Image from "next/image";

const InfoRow = ({ label, value, icon: Icon, isMono = false }: { label: string, value: string | number | undefined | null, icon?: React.ElementType, isMono?: boolean }) => {
    if (!value) return null;
    return (
        <div className="flex justify-between items-center py-2">
            <div className="flex items-center gap-2 text-sm text-gray-600">
                {Icon && <Icon className="h-4 w-4" />}
                <span>{label}</span>
            </div>
            <span className={cn("text-sm font-semibold text-gray-800 text-right", isMono ? 'font-mono break-all' : '')}>{value}</span>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const amountUSD = transaction.amount_usd || 0;
    const amountLocal = transaction.amount || 0;

    const itemName = transaction.notes || `${transaction.type} Transaction`;
    const dateString = format(transactionDate, "PPP p");

    return (
        <div ref={ref} className="w-full max-w-md mx-auto bg-white text-gray-800 shadow-xl rounded-2xl font-sans overflow-hidden border border-gray-200/80">
            <div className="p-6 space-y-6 relative">
                 <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white p-2 rounded-full">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                </div>

                <header className="flex items-center justify-between pt-6">
                     <Image src="https://ycoincash.com/wp-content/uploads/2024/10/cropped-20240215_022836-150x150.jpg" alt="Coin Cash Logo" width={40} height={40} className="h-10 w-10" />
                    <Badge variant={transaction.status === 'Confirmed' ? 'default' : 'secondary'} className={cn(
                        transaction.status === 'Confirmed' && 'bg-green-600 text-white',
                        transaction.status === 'Cancelled' && 'bg-red-600 text-white',
                    )}>{transaction.status}</Badge>
                </header>

                {transaction.attachment_url && (
                    <div className="rounded-lg overflow-hidden border">
                        <Image src={transaction.attachment_url} alt="Transaction Attachment" width={400} height={300} className="w-full h-auto object-cover" />
                    </div>
                )}
                
                <div className="text-center space-y-2">
                    <p className="text-sm text-gray-500">Amount Sent</p>
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                        {new Intl.NumberFormat('en-US').format(amountLocal)} <span className="text-2xl text-gray-500 font-medium">{transaction.currency}</span>
                    </h1>
                    <p className="text-sm text-green-600 font-semibold">
                       ~ ${amountUSD.toFixed(2)} USD
                    </p>
                </div>

                <Card>
                    <CardContent className="divide-y divide-gray-100 p-0">
                        <InfoRow label="Client Name" value={client?.name} icon={User} />
                        <InfoRow label="Transaction Type" value={transaction.type} />
                        <InfoRow label="Date & Time" value={dateString} />
                        <InfoRow label="Amount (USDT)" value={transaction.amount_usdt?.toFixed(2)} />
                        <InfoRow label="Fee (USD)" value={transaction.fee_usd?.toFixed(2)} />
                        <InfoRow label="Client Wallet" value={transaction.client_wallet_address} icon={Wallet} isMono />
                        <InfoRow label="Transaction Hash" value={transaction.hash} icon={Hash} isMono />
                        <InfoRow label="Remittance #" value={transaction.remittance_number} isMono />
                        <InfoRow label="Notes" value={transaction.notes} />
                    </CardContent>
                </Card>

                 <div className="text-center space-y-4 pt-4">
                    <div className="inline-block p-3 bg-green-100 rounded-full">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                    </div>

                    <h2 className="text-xl font-bold text-gray-800">Your payment successfully processed</h2>
                    <p className="text-xs text-gray-500 leading-relaxed max-w-sm mx-auto">
                        This confirms the transaction details. If you have any questions, please contact us with the transaction hash or remittance number.
                    </p>
                </div>
            </div>
            
            <div className="p-4 bg-gray-50 border-t flex items-center gap-2">
                <Button asChild className="w-full" variant="outline">
                    <Link href="/transactions"><ArrowLeft /> Back to Transactions</Link>
                </Button>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
