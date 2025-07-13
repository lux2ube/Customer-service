
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, XCircle, Landmark, Wallet, Hourglass, Check } from "lucide-react";

interface Step {
    title: string;
    details: React.ReactNode;
    icon: React.ElementType;
    isCompleted: boolean;
    isCurrent: boolean;
    timestamp?: string;
}

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const steps: Step[] = [];
    const transactionTime = transaction.date ? format(parseISO(transaction.date), "dd/MM/yyyy, h:mm a") : 'N/A';
    const confirmedTime = transaction.createdAt ? format(parseISO(transaction.createdAt), "dd/MM/yyyy, h:mm a") : transactionTime;

    const isConfirmed = transaction.status === 'Confirmed';
    const isCancelled = transaction.status === 'Cancelled';
    
    if (transaction.type === 'Deposit') {
        steps.push({
            title: 'الطلب المستلم (إيداع)',
            icon: Landmark,
            isCompleted: true,
            isCurrent: !isConfirmed && !isCancelled,
            timestamp: transactionTime,
            details: (
                <div className="space-y-1">
                    <p>العميل <span className="font-bold">{client?.name || transaction.clientName}</span> قام بإيداع:</p>
                    <p className="text-lg font-bold text-primary">{transaction.amount} {transaction.currency}</p>
                    <p className="text-xs text-muted-foreground">من حساب: {transaction.bankAccountName}</p>
                    <p className="text-xs text-muted-foreground pt-2">رقم الحوالة:</p>
                    <p className="font-mono text-xs break-all">{transaction.remittance_number || 'N/A'}</p>
                </div>
            )
        });
        steps.push({
            title: 'تم التسليم بنجاح',
            icon: Wallet,
            isCompleted: isConfirmed,
            isCurrent: isConfirmed,
            timestamp: confirmedTime,
            details: (
                <div className="space-y-1">
                    <p>تم إرسال المبلغ الصافي:</p>
                    <p className="text-lg font-bold text-green-600">{transaction.amount_usdt.toFixed(2)} USDT</p>
                    <p className="text-xs text-muted-foreground">إلى المحفظة:</p>
                    <p className="font-mono text-xs break-all">{transaction.client_wallet_address}</p>
                    <p className="text-xs text-muted-foreground pt-2">معرّف العملية (Hash):</p>
                    <p className="font-mono text-xs break-all">{transaction.hash || 'N/A'}</p>
                </div>
            )
        });
    } else { // Withdraw
        steps.push({
            title: 'الطلب المستلم (سحب)',
            icon: Wallet,
            isCompleted: true,
            isCurrent: !isConfirmed && !isCancelled,
            timestamp: transactionTime,
            details: (
                 <div className="space-y-1">
                    <p>العميل <span className="font-bold">{client?.name || transaction.clientName}</span> قام بإرسال:</p>
                    <p className="text-lg font-bold text-primary">{transaction.amount_usdt.toFixed(2)} USDT</p>
                    <p className="text-xs text-muted-foreground">من محفظته إلى:</p>
                    <p className="text-xs">{transaction.cryptoWalletName}</p>
                    <p className="text-xs text-muted-foreground pt-2">معرّف العملية (Hash):</p>
                    <p className="font-mono text-xs break-all">{transaction.hash || 'N/A'}</p>
                </div>
            )
        });
         steps.push({
            title: 'تم التسليم بنجاح',
            icon: Landmark,
            isCompleted: isConfirmed,
            isCurrent: isConfirmed,
            timestamp: confirmedTime,
            details: (
                <div className="space-y-1">
                    <p>تم إرسال المبلغ الصافي:</p>
                    <p className="text-lg font-bold text-green-600">{transaction.amount} {transaction.currency}</p>
                    <p className="text-xs text-muted-foreground">إلى حساب:</p>
                    <p className="text-xs">{transaction.bankAccountName}</p>
                    <p className="text-xs text-muted-foreground pt-2">رقم الحوالة:</p>
                    <p className="font-mono text-xs break-all">{transaction.remittance_number || 'N/A'}</p>
                </div>
            )
        });
    }
     
    // Adjust logic for cancelled state
    if (isCancelled) {
        steps.forEach(step => {
            step.isCompleted = false;
            step.isCurrent = false;
        });
        steps.push({
            title: 'تم إلغاء الطلب',
            icon: XCircle,
            isCompleted: true,
            isCurrent: true,
            timestamp: confirmedTime,
            details: <p>تم إلغاء هذه العملية.</p>
        });
    }


    return (
        <div ref={ref} dir="rtl" className="w-full max-w-md mx-auto bg-background text-foreground font-cairo p-4">
            <div className="border border-border rounded-lg">
                <div className="text-center p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">معرف التتبع</h2>
                    <p className="font-mono text-muted-foreground">{transaction.id.slice(-12).toUpperCase()}</p>
                    <p className="text-sm font-semibold mt-1">{client?.name || transaction.clientName}</p>
                </div>
                <div className="p-4">
                    <div className="relative pl-8 pr-4 py-4">
                        {/* Vertical line */}
                        <div className="absolute top-4 bottom-4 right-6 w-0.5 bg-border"></div>
                        
                        {steps.map((step, index) => (
                            <div key={index} className="relative mb-8 last:mb-0">
                                <div className="absolute top-0 right-[25px] transform translate-x-1/2 -translate-y-1/2">
                                     <div className={cn(
                                        "h-6 w-6 rounded-full flex items-center justify-center bg-background border-2",
                                        step.isCurrent ? "border-primary" : "border-border"
                                    )}>
                                        <div className={cn(
                                            "h-3 w-3 rounded-full",
                                            step.isCompleted ? 'bg-primary' : 'bg-muted'
                                        )}>
                                        </div>
                                    </div>
                                </div>
                                <div className="mr-10">
                                    <p className="font-semibold">{step.title}</p>
                                    <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md mt-2">
                                        {step.details}
                                    </div>
                                    <p className="text-xs text-muted-foreground pt-2">
                                        {step.timestamp}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
