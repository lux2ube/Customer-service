
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle, CircleDot, Circle, Wallet, Landmark, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";

interface Step {
    title: string;
    description: string;
    icon: React.ElementType;
    isCompleted: boolean;
    isCurrent: boolean;
}

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const getStatusText = (status: Transaction['status']) => {
        switch (status) {
            case 'Confirmed': return 'مؤكد';
            case 'Cancelled': return 'ملغي';
            case 'Pending': return 'قيد الإنتظار';
            default: return status;
        }
    };

    const formatCurrency = (value: number | undefined, currency: string) => {
        if (value === undefined) return '';
        return new Intl.NumberFormat('en-US').format(value) + ` ${currency}`;
    }

    const steps: Step[] = [];

    if (transaction.type === 'Deposit') {
        steps.push({
            title: 'تم استلام الطلب',
            description: `العميل ${client?.name || transaction.clientName} أرسل ${formatCurrency(transaction.amount, transaction.currency)} من حساب ${transaction.bankAccountName}.`,
            icon: Circle,
            isCompleted: true,
            isCurrent: false,
        });

        steps.push({
            title: 'قيد التنفيذ',
            description: `سيتم إرسال ${formatCurrency(transaction.amount_usdt, 'USDT')} إلى محفظة العميل: ${transaction.client_wallet_address}. الرسوم: ${formatCurrency(transaction.fee_usd, 'USD')}.`,
            icon: CircleDot,
            isCompleted: transaction.status === 'Confirmed',
            isCurrent: transaction.status === 'Pending',
        });

        steps.push({
            title: 'تم التسليم',
            description: `تم تأكيد العملية بنجاح. Hash: ${transaction.hash || 'N/A'}.`,
            icon: CheckCircle,
            isCompleted: transaction.status === 'Confirmed',
            isCurrent: transaction.status === 'Confirmed',
        });
    } else { // Withdraw Logic
        steps.push({
            title: 'تم استلام الطلب',
            description: `العميل ${client?.name || transaction.clientName} أرسل ${formatCurrency(transaction.amount_usdt, 'USDT')} من محفظته إلى حسابنا ${transaction.cryptoWalletName}.`,
            icon: Circle,
            isCompleted: true,
            isCurrent: false,
        });

        steps.push({
            title: 'قيد التنفيذ',
            description: `سيتم إرسال ${formatCurrency(transaction.amount, transaction.currency)} إلى حساب العميل البنكي: ${transaction.bankAccountName}.`,
            icon: CircleDot,
            isCompleted: transaction.status === 'Confirmed',
            isCurrent: transaction.status === 'Pending',
        });

        steps.push({
            title: 'تم التسليم',
            description: `تم تأكيد العملية بنجاح. رقم الحوالة: ${transaction.remittance_number || 'N/A'}.`,
            icon: CheckCircle,
            isCompleted: transaction.status === 'Confirmed',
            isCurrent: transaction.status === 'Confirmed',
        });
    }
     
    // Adjust logic for cancelled state
    if (transaction.status === 'Cancelled') {
        steps.forEach(step => {
            step.isCompleted = false;
            step.isCurrent = false;
        });
        steps.push({
            title: 'تم إلغاء الطلب',
            description: 'تم إلغاء هذه العملية.',
            icon: CheckCircle, // You can use a different icon like XCircle
            isCompleted: true,
            isCurrent: true,
        });
    }


    return (
        <div ref={ref} dir="rtl" className="w-full max-w-md mx-auto bg-background text-foreground font-cairo p-4">
            <Card className="border-border">
                <CardHeader className="text-center">
                    <CardTitle className="text-lg">معرف التتبع: {transaction.id.slice(-12).toUpperCase()}</CardTitle>
                    <CardDescription>{client?.name || transaction.clientName}</CardDescription>
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
                                    <p className="text-sm text-muted-foreground">{step.description}</p>
                                    <p className="text-xs text-muted-foreground pt-1">
                                        {format(parseISO(transaction.date), "dd/MM/yyyy, h:mm a")}
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
