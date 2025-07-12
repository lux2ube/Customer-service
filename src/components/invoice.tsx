
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Button } from "./ui/button";
import Link from "next/link";
import { CheckCircle, Target } from "lucide-react";

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const amountUSD = transaction.amount_usd || 0;

    const itemName = transaction.notes || `${transaction.type} Transaction`;
    const dateString = format(transactionDate, "PPP");
    const dayString = format(transactionDate, "eeee");

    return (
        <div ref={ref} className="w-full max-w-md mx-auto bg-white text-gray-800 shadow-lg rounded-xl font-sans overflow-hidden border border-gray-200">
            <div className="p-6 md:p-8 space-y-6">
                
                {/* Item Summary */}
                <div className="p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <Target className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <p className="font-semibold text-sm">{itemName}</p>
                            <p className="text-xs text-gray-500">{dateString}, {dayString}</p>
                        </div>
                    </div>
                    <p className="font-semibold text-sm text-blue-600">
                        ${amountUSD.toFixed(2)}
                    </p>
                </div>

                {/* Success Message */}
                <div className="text-center space-y-4 pt-4">
                    <div className="relative inline-block">
                        <div className="absolute -inset-4 flex items-center justify-center">
                            <div className="w-16 h-16 bg-green-100/50 rounded-full animate-pulse"></div>
                        </div>
                        <CheckCircle className="h-12 w-12 text-green-500 bg-white rounded-full p-1 z-10" />
                    </div>

                    <h1 className="text-2xl font-bold text-gray-800">Your payment successfully processed</h1>
                    <p className="text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
                        We will review your transaction and get back to you. On workdays it usually happens within 24 hours. At that time you will be notified via email.
                    </p>
                    <p className="text-sm text-gray-600 bg-gray-100 p-2 rounded-md">
                        You reserved: <span className="font-bold">{itemName} on {dateString}</span>. 
                        <a href="#" className="text-blue-600 hover:underline ml-1">Contact us</a> if something's wrong.
                    </p>
                </div>

                {/* Action Button */}
                <div className="pt-4">
                    <Button asChild className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-base">
                        <Link href="/transactions">Back to Transactions</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
