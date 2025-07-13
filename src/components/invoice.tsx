
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle, CircleDot, Circle, XCircle, Banknote, Landmark, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

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
    const isPending = transaction.status === 'Pending';
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
            <Card className="border-border">
                <CardHeader className="text-center">
                    <CardTitle className="text-lg">معرف التتبع: <span className="font-mono">{transaction.id.slice(-12).toUpperCase()}</span></CardTitle>
                    <p className="text-muted-foreground text-sm">{client?.name || transaction.clientName}</p>
                </CardHeader>
                <CardContent>
                    <div className="relative pl-8 pr-4 py-4">
                        {/* Vertical line */}
                        <div className="absolute top-0 bottom-0 right-8 w-0.5 bg-border"></div>
                        
                        {steps.map((step, index) => (
                            <div key={index} className="relative mb-8 last:mb-0">
                                <div className="absolute -top-1 right-8 transform translate-x-1/2">
                                     <div className={cn(
                                        "h-5 w-5 rounded-full flex items-center justify-center",
                                        step.isCompleted ? 'bg-primary' : 'bg-muted',
                                        step.isCurrent && 'ring-4 ring-primary/30'
                                    )}>
                                        <step.icon className={cn(
                                            "h-3 w-3",
                                            step.isCompleted ? 'text-primary-foreground' : 'text-muted-foreground'
                                        )} />
                                    </div>
                                </div>
                                <div className="mr-12">
                                    <p className="font-semibold">{step.title}</p>
                                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md mt-2">
                                        {step.details}
                                    </div>
                                    <p className="text-xs text-muted-foreground pt-2">
                                        {step.timestamp}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
