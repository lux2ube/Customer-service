
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { CheckCircle2, Copy, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JaibLogo } from "./jaib-logo";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

const DetailItem = ({ label, value, canCopy = false }: { label: string, value: string | undefined | number, canCopy?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(String(value));
        toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    };

    if (value === undefined || value === null || value === '') return null;

    return (
        <div className="flex justify-between items-baseline">
            <p className="text-xs text-muted-foreground">{label}</p>
             <div className="flex items-center gap-1.5">
                <p className="text-xs font-mono text-right font-medium">{String(value)}</p>
                {canCopy && (
                    <button onClick={handleCopy} className="text-gray-400 hover:text-primary shrink-0">
                        <Copy size={12} />
                    </button>
                )}
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: Transaction['status'] }) => {
    const variant = {
        Confirmed: 'default',
        Pending: 'secondary',
        Cancelled: 'destructive'
    } as const;
    const icon = {
        Confirmed: <CheckCircle2 size={12} />,
        Pending: <Clock size={12} />,
        Cancelled: <XCircle size={12} />
    };

    return (
        <Badge variant={variant[status]} className="flex gap-1 items-center px-1.5 py-0.5">
            {icon[status]}
            <span className="text-xs">{status}</span>
        </Badge>
    );
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const formatCurrency = (value: number | undefined, currency: string) => {
        if (value === undefined || value === null) return 'N/A';
        if (currency === 'USDT') return `${value.toFixed(2)} USDT`;
        try {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
        } catch (e) {
            return `${new Intl.NumberFormat('en-US').format(value)} ${currency}`;
        }
    }

    const formattedDate = transaction.date && !isNaN(new Date(transaction.date).getTime())
        ? format(new Date(transaction.date), 'MMM dd, yyyy @ HH:mm')
        : 'N/A';

    return (
        <div ref={ref} className="bg-gray-50 dark:bg-gray-900 p-4 font-sans text-gray-800">
            <div className="w-full max-w-3xl mx-auto bg-white dark:bg-card shadow-xl rounded-lg overflow-hidden border">
                {/* Header */}
                <header className="bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <JaibLogo className="h-6 w-auto text-white" />
                        <div>
                            <h1 className="text-lg font-bold">Transaction Receipt</h1>
                            <p className="text-xs opacity-80 font-mono">ID: {transaction.id}</p>
                        </div>
                    </div>
                    <StatusBadge status={transaction.status} />
                </header>
                
                <main className="p-3 space-y-3">
                    {/* Top Row: Client & Transaction Info */}
                    <div className="grid grid-cols-2 gap-3 border-b pb-3">
                        <div className="space-y-1">
                            <h2 className="text-xs font-bold text-primary">BILLED TO</h2>
                            <p className="text-sm font-semibold">{client.name}</p>
                            <p className="text-xs text-muted-foreground">{client.phone}</p>
                        </div>
                        <div className="space-y-1">
                             <h2 className="text-xs font-bold text-primary text-right">TRANSACTION DETAILS</h2>
                             <DetailItem label="Date" value={formattedDate} />
                             <DetailItem label="Type" value={transaction.type} />
                             <DetailItem label="Remittance #" value={transaction.remittance_number} />
                        </div>
                    </div>

                    {/* Middle Row: Financial Table */}
                    <div className="space-y-2">
                        <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-muted-foreground border-b pb-1">
                            <div className="col-span-2">Description</div>
                            <div>Amount</div>
                            <div>Fee/Expense</div>
                            <div className="text-right">Total</div>
                        </div>

                        <div className="grid grid-cols-5 gap-2 text-sm items-center">
                            {/* Row 1 */}
                            <div className="col-span-2 font-medium">
                                {transaction.type === 'Deposit' ? 'Deposit to Bank' : 'Withdrawal from Bank'}
                            </div>
                            <div className="font-mono text-xs">{transaction.amount} {transaction.currency}</div>
                            <div className="font-mono text-xs">{formatCurrency(transaction.fee_usd, 'USD')}</div>
                            <div className="font-mono text-xs text-right">{formatCurrency(transaction.amount_usd, 'USD')}</div>
                           
                             {/* Row 2 */}
                             <div className="col-span-2 text-xs text-muted-foreground pl-4">
                                from {transaction.bankAccountName}
                             </div>
                             <div/>
                             <div className="font-mono text-xs">
                                {transaction.expense_usd && transaction.expense_usd > 0 ? `(${formatCurrency(transaction.expense_usd, 'USD')})` : ''}
                             </div>
                             <div/>
                        </div>
                    </div>
                    
                    {/* Bottom Row: Crypto Details & Total */}
                    <div className="grid grid-cols-2 gap-3 border-t pt-3">
                        <div className="space-y-1">
                             <h2 className="text-xs font-bold text-primary">CRYPTO DETAILS</h2>
                             <DetailItem label="Client Address" value={transaction.client_wallet_address} canCopy />
                             <DetailItem label="Tx Hash" value={transaction.hash} canCopy />
                             <DetailItem label="Company Wallet" value={transaction.cryptoWalletName} />
                        </div>
                        <div className="flex flex-col items-end justify-end space-y-1 bg-muted/50 p-2 rounded-md">
                            <p className="text-xs font-semibold text-muted-foreground">FINAL AMOUNT</p>
                            <p className="text-xl font-bold font-mono text-primary">{formatCurrency(transaction.amount_usdt, 'USDT')}</p>
                        </div>
                    </div>
                </main>

                {/* Footer */}
                {transaction.notes && (
                    <footer className="border-t p-3 text-xs text-muted-foreground bg-gray-50/50 dark:bg-card">
                        <p><span className="font-bold">Notes:</span> {transaction.notes}</p>
                    </footer>
                )}
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
