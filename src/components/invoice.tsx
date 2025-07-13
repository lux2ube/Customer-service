
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Label } from "./ui/label";
import { cn } from "@/lib/utils";

const InfoRow = ({ label, value, isMono = false }: { label: string, value: string | number | undefined | null, isMono?: boolean }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex justify-between items-center text-sm py-2">
            <Label className="text-muted-foreground">{label}</Label>
            <p className={cn("font-medium", isMono && "font-mono")}>{value}</p>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const formattedDate = format(transactionDate, "PPP p");

    const getStatusVariant = (status: Transaction['status']) => {
        switch(status) {
            case 'Confirmed': return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
            case 'Pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
            case 'Cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
            default: return 'bg-muted text-muted-foreground';
        }
    }

    return (
        <div ref={ref} className="w-full max-w-md mx-auto bg-background text-foreground font-cairo p-4">
             <Card>
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle>Transaction Invoice</CardTitle>
                            <CardDescription className="font-mono pt-1">{transaction.id}</CardDescription>
                        </div>
                         <div className={cn("text-xs font-bold px-2.5 py-1 rounded-full", getStatusVariant(transaction.status))}>
                            {transaction.status}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Details</h4>
                        <div className="divide-y divide-border rounded-md border p-4">
                            <InfoRow label="Date" value={formattedDate} />
                            <InfoRow label="Client" value={client?.name || transaction.clientName} />
                            <InfoRow label="Type" value={transaction.type} />
                            <InfoRow label="Source/Destination Account" value={transaction.bankAccountName || transaction.cryptoWalletName} />
                        </div>
                    </div>
                    
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Financials</h4>
                         <div className="divide-y divide-border rounded-md border p-4">
                            <InfoRow label={`Amount (${transaction.currency})`} value={transaction.amount.toLocaleString()} isMono />
                            <InfoRow label="Amount (USD)" value={transaction.amount_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono />
                            <InfoRow label="Fee (USD)" value={transaction.fee_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono />
                            {transaction.expense_usd && transaction.expense_usd > 0 ? (
                                <InfoRow label="Expense/Loss (USD)" value={transaction.expense_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono />
                            ): null}
                            <InfoRow label="Final USDT Amount" value={`${transaction.amount_usdt.toLocaleString()} USDT`} isMono />
                        </div>
                    </div>

                    {(transaction.notes || transaction.hash || transaction.client_wallet_address) && (
                        <div>
                            <h4 className="text-sm font-semibold mb-2 text-muted-foreground">Additional Info</h4>
                            <div className="divide-y divide-border rounded-md border p-4 space-y-2">
                               {transaction.notes && <p className="text-sm break-words">{transaction.notes}</p>}
                               {transaction.hash && <InfoRow label="Hash" value={transaction.hash} isMono />}
                               {transaction.client_wallet_address && <InfoRow label="Client Wallet" value={transaction.client_wallet_address} isMono />}
                               {transaction.remittance_number && <InfoRow label="Remittance #" value={transaction.remittance_number} isMono />}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
