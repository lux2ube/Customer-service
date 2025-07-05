
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import { Button } from "./ui/button";
import { Printer } from "lucide-react";

interface InvoiceProps {
    transaction: Transaction;
    client: Client;
    company: { name: string; address: string; phone: string; };
}

export function Invoice({ transaction, client, company }: InvoiceProps) {
    const formatCurrency = (value: number, currency: string) => {
        // Simple formatter, can be expanded
        return new Intl.NumberFormat('en-US', {
            style: 'decimal',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(value) + ` ${currency}`;
    };

    const formatUsd = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(value);
    }
    
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="max-w-4xl mx-auto bg-white p-8 md:p-12 rounded-lg shadow-lg font-sans invoice-container">
            <style jsx global>{`
                @media print {
                    body {
                        background-color: #fff;
                    }
                    .no-print {
                        display: none;
                    }
                    .invoice-container {
                        box-shadow: none !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                        padding: 0 !important;
                    }
                }
            `}</style>
            
            <header className="flex justify-between items-start mb-10">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">{company.name}</h1>
                    <p className="text-gray-500 whitespace-pre-line">{company.address}</p>
                    <p className="text-gray-500">{company.phone}</p>
                </div>
                <div className="text-right">
                    <h2 className="text-3xl font-semibold text-gray-700 uppercase">Invoice</h2>
                    <p className="text-gray-500 mt-1"># {transaction.id.slice(-8).toUpperCase()}</p>
                </div>
            </header>

            <section className="flex justify-between mb-10">
                <div>
                    <h3 className="text-gray-500 font-semibold mb-2">Bill To</h3>
                    <p className="font-bold text-gray-800">{client.name}</p>
                    <p className="text-gray-600">{client.phone}</p>
                </div>
                <div className="text-right">
                    <p><span className="font-semibold text-gray-500">Invoice Date:</span> {format(new Date(transaction.date), 'MMMM dd, yyyy')}</p>
                    <p><span className="font-semibold text-gray-500">Transaction Type:</span> {transaction.type}</p>
                </div>
            </section>

            <section className="mb-10">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-100 text-gray-600 uppercase text-sm">
                            <th className="p-3 font-medium">Description</th>
                            <th className="p-3 text-right font-medium">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b border-gray-100">
                            <td className="p-3">
                                <p className="font-medium text-gray-800">{transaction.type} ({transaction.currency})</p>
                                <p className="text-sm text-gray-500">{transaction.notes || 'Transaction'}</p>
                            </td>
                            <td className="p-3 text-right font-mono">{formatCurrency(transaction.amount, transaction.currency)}</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section className="flex justify-end mb-10">
                <div className="w-full max-w-xs text-gray-700">
                    <div className="flex justify-between py-2">
                        <span className="text-gray-500">Subtotal (USD)</span>
                        <span className="font-mono">{formatUsd(transaction.amount_usd)}</span>
                    </div>
                    <div className="flex justify-between py-2">
                        <span className="text-gray-500">Fee</span>
                        <span className="font-mono">{formatUsd(transaction.fee_usd)}</span>
                    </div>
                    {transaction.expense_usd && transaction.expense_usd > 0 ? (
                        <div className="flex justify-between py-2 text-red-600">
                            <span className="font-semibold">Expense / Loss</span>
                            <span className="font-mono">{formatUsd(transaction.expense_usd)}</span>
                        </div>
                    ) : null}
                    <div className="border-t border-gray-200 my-2"></div>
                    <div className="flex justify-between py-2 font-bold text-lg text-gray-800">
                        <span>Grand Total (USD)</span>
                        <span className="font-mono">{formatUsd(transaction.amount_usd)}</span>
                    </div>
                </div>
            </section>
            
             <footer className="text-center text-gray-500 text-sm pt-8 border-t border-gray-200">
                <p>Thank you for your business!</p>
                {transaction.hash && <p className="mt-2 font-mono text-xs">Tx Hash: {transaction.hash}</p>}
            </footer>

            <div className="no-print mt-10 text-center">
                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print / Save as PDF
                </Button>
            </div>
        </div>
    )
}
