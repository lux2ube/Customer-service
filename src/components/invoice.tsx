
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckCircle2, Copy, XCircle, Clock, User, Phone, Hash, Calendar, FileText, Banknote, Landmark, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { JaibLogo } from "./jaib-logo";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";

const DetailItem = ({ icon: Icon, label, value, canCopy = false }: { icon: React.ElementType, label: string, value: string | undefined | number, canCopy?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(String(value));
        toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    };

    if (value === undefined || value === null || value === '') return null;

    return (
        <div className="flex items-start justify-between py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-right text-gray-800 dark:text-gray-100 break-all">{String(value)}</span>
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
        <Badge variant={variant[status]} className="flex gap-1.5 items-center">
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
            // Fallback for invalid currency codes like USDT
            return `${new Intl.NumberFormat('en-US').format(value)} ${currency}`;
        }
    }

    const formattedDate = transaction.date && !isNaN(new Date(transaction.date).getTime())
        ? format(new Date(transaction.date), 'MMM dd, yyyy @ HH:mm')
        : 'N/A';

    return (
        <div ref={ref} className="bg-gray-50 dark:bg-gray-900 p-4 font-sans text-gray-800">
            <div className="w-full max-w-2xl mx-auto bg-white dark:bg-card shadow-xl rounded-xl overflow-hidden border">
                {/* Header */}
                <header className="bg-gradient-to-r from-primary via-primary/90 to-primary/80 text-primary-foreground p-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold">Transaction Receipt</h1>
                        <p className="text-xs opacity-80">Ref: {transaction.id}</p>
                    </div>
                    <JaibLogo className="h-8 w-auto text-white" />
                </header>
                
                <main className="grid md:grid-cols-2 gap-6 p-4">
                    {/* Left Column: Client & Transaction Info */}
                    <section className="space-y-4">
                        <div>
                            <h2 className="text-sm font-bold text-primary mb-2 border-b pb-1">Billed To</h2>
                            <div className="space-y-1 text-xs">
                                <p className="font-semibold text-base">{client.name}</p>
                                <p className="text-muted-foreground flex items-center gap-2"><Phone size={12} /> {client.phone}</p>
                            </div>
                        </div>
                         <div>
                            <h2 className="text-sm font-bold text-primary mb-2 border-b pb-1">Transaction Info</h2>
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground font-semibold">Status:</span>
                                    <StatusBadge status={transaction.status} />
                                </div>
                                <DetailItem icon={FileText} label="Type" value={transaction.type} />
                                <DetailItem icon={Calendar} label="Date" value={formattedDate} />
                                <DetailItem icon={Hash} label="Remittance #" value={transaction.remittance_number} />
                            </div>
                        </div>
                    </section>

                    {/* Right Column: Financial Breakdown */}
                    <section className="space-y-4">
                       <div>
                            <h2 className="text-sm font-bold text-primary mb-2 border-b pb-1">Financial Details</h2>
                            <div className="space-y-1.5 bg-gray-50 dark:bg-secondary/20 p-3 rounded-lg">
                                <DetailItem icon={Banknote} label="Amount" value={`${transaction.amount} ${transaction.currency}`} />
                                <DetailItem icon={Banknote} label="Amount (USD)" value={formatCurrency(transaction.amount_usd, 'USD')} />
                                <DetailItem icon={Banknote} label="Fee (USD)" value={formatCurrency(transaction.fee_usd, 'USD')} />
                                {transaction.expense_usd && transaction.expense_usd > 0 ? (
                                    <DetailItem icon={Banknote} label="Expense/Loss" value={formatCurrency(transaction.expense_usd, 'USD')} />
                                ) : null}
                                <div className="border-t my-2"></div>
                                <div className="flex justify-between items-center pt-1">
                                    <p className="text-sm font-bold">Total (USDT)</p>
                                    <p className="text-sm font-bold text-primary">{formatCurrency(transaction.amount_usdt, 'USDT')}</p>
                                </div>
                            </div>
                        </div>
                         <div>
                            <h2 className="text-sm font-bold text-primary mb-2 border-b pb-1">Account & Wallet Details</h2>
                            <div className="space-y-1.5">
                                <DetailItem icon={Landmark} label="Bank Account" value={transaction.bankAccountName} />
                                <DetailItem icon={Wallet} label="Company Wallet" value={transaction.cryptoWalletName} />
                                <DetailItem icon={Wallet} label="Client Address" value={transaction.client_wallet_address} canCopy />
                                <DetailItem icon={Hash} label="Tx Hash" value={transaction.hash} canCopy />
                            </div>
                        </div>
                    </section>
                </main>

                {/* Footer */}
                {transaction.notes && (
                    <footer className="border-t p-4 text-xs text-muted-foreground bg-gray-50/50 dark:bg-card">
                        <h3 className="font-bold mb-1">Notes:</h3>
                        <p>{transaction.notes}</p>
                    </footer>
                )}
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
