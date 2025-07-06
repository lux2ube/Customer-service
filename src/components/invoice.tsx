'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const InvoiceLogo = () => (
    <div className="flex items-center gap-2 text-primary">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span className="text-xl font-semibold">Customer Central</span>
    </div>
);


const getStatusVariant = (status: Transaction['status']) => {
    switch(status) {
        case 'Confirmed': return 'default';
        case 'Cancelled': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
};

const formatCurrency = (value: number | undefined, currency: string = 'USD') => {
    if (value === undefined) return 'N/A';
    if (currency === 'USDT') {
        return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}\u00A0USDT`;
    }
    // Use a non-breaking space for currency symbols to prevent awkward wrapping
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value).replace(/\s/g, '\u00A0');
}

interface InvoiceProps {
    transaction: Transaction;
    client: Client;
}

export const Invoice = React.forwardRef<HTMLDivElement, InvoiceProps>(({ transaction, client }, ref) => {
    return (
        <div ref={ref} className="bg-white p-4 sm:p-8 font-sans text-gray-800">
            <Card className="w-full max-w-4xl mx-auto shadow-lg">
                <CardHeader className="p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <InvoiceLogo />
                            <p className="text-muted-foreground text-sm mt-2">
                                123 Finance Street<br />
                                Moneyland, USA 12345<br/>
                                contact@customercentral.app
                            </p>
                        </div>
                        <div className="text-right">
                            <h1 className="text-2xl sm:text-4xl font-bold text-primary uppercase tracking-wider">Invoice</h1>
                            <p className="text-muted-foreground mt-2"># {transaction.id}</p>
                             <div className="mt-1">
                                <Badge variant={getStatusVariant(transaction.status)}>{transaction.status}</Badge>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-6">
                    <Separator className="my-4" />
                    <div className="grid grid-cols-2 gap-4 mb-8">
                        <div>
                            <h2 className="font-semibold text-gray-600 mb-1">BILLED TO</h2>
                            <p className="font-bold">{client.name}</p>
                            <p className="text-muted-foreground">{client.phone}</p>
                        </div>
                        <div className="text-right">
                             <div className="grid grid-cols-2 gap-y-1 text-sm">
                                <span className="font-semibold text-gray-600">Invoice Date:</span>
                                <span>{transaction.date && !isNaN(new Date(transaction.date).getTime()) ? format(new Date(transaction.date), 'MMMM dd, yyyy') : 'N/A'}</span>
                                <span className="font-semibold text-gray-600">Created At:</span>
                                <span>{transaction.createdAt && !isNaN(new Date(transaction.createdAt).getTime()) ? format(new Date(transaction.createdAt), 'MMMM dd, yyyy') : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50">
                                <TableHead className="w-[60%]">Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow>
                                <TableCell>
                                    <p className="font-medium">{`Transaction: ${transaction.type}`}</p>
                                    <div className="text-sm text-muted-foreground space-y-1 mt-1">
                                        <p>{`From: ${transaction.type === 'Deposit' ? transaction.client_wallet_address : (transaction.bankAccountName || 'Bank Account')}`}</p>
                                        <p>{`To: ${transaction.type === 'Deposit' ? (transaction.bankAccountName || 'Bank Account') : transaction.client_wallet_address}`}</p>
                                    </div>
                                    {transaction.remittance_number && <p className="text-xs text-muted-foreground mt-2">Remittance #: {transaction.remittance_number}</p>}
                                    {transaction.hash && <p className="text-xs text-muted-foreground mt-1 font-mono break-all">Hash: {transaction.hash}</p>}
                                </TableCell>
                                <TableCell className="text-right font-mono">{formatCurrency(transaction.amount, transaction.currency)}</TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                    
                    <div className="flex justify-end mt-8">
                        <div className="w-full max-w-sm space-y-2 text-sm">
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Subtotal (USD)</span>
                                <span className="font-medium font-mono">{formatCurrency(transaction.amount_usd)}</span>
                            </div>
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Fee (USD)</span>
                                <span className="font-medium font-mono">{formatCurrency(transaction.fee_usd)}</span>
                            </div>
                            {transaction.expense_usd && transaction.expense_usd > 0 ? (
                                <div className="flex justify-between items-center text-destructive">
                                    <span className="">Expense/Loss (USD)</span>
                                    <span className="font-medium font-mono">{formatCurrency(transaction.expense_usd)}</span>
                                </div>
                            ) : null}
                            <Separator className="my-2" />
                            <div className="flex justify-between items-center text-base font-bold text-primary">
                                <span>Total Final Amount</span>
                                <span className="font-mono">{formatCurrency(transaction.amount_usdt, 'USDT')}</span>
                            </div>
                        </div>
                    </div>

                    {transaction.notes && (
                        <div className="mt-8">
                            <h3 className="font-semibold text-gray-600 mb-1">Notes</h3>
                            <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/20">{transaction.notes}</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="p-6 text-center text-xs text-muted-foreground">
                    <p>Thank you for your business. If you have any questions, please contact us.</p>
                </CardFooter>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';