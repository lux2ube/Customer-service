
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";
import { Card } from "./ui/card";

interface Step {
    title: string;
    location?: string;
    description: string;
    timestamp: string;
    isCompleted: boolean;
    isCurrent: boolean;
}

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const getStatusText = (status: Transaction['status']) => {
        switch (status) {
            case 'Confirmed': return 'تم التسليم';
            case 'Cancelled': return 'ملغي';
            case 'Pending': return 'قيد الإنتظار';
            default: return status;
        }
    };

    const steps: Step[] = [
        {
            title: "تم إنشاء الطلب",
            location: "النظام",
            description: "تم تسجيل المعاملة في النظام",
            timestamp: transaction.createdAt ? format(new Date(transaction.createdAt), "dd/MM/yyyy h:mm a") : 'N/A',
            isCompleted: true,
            isCurrent: transaction.status === 'Pending',
        },
        {
            title: "قيد التنفيذ",
            location: transaction.bankAccountName || 'بنك',
            description: `من ${transaction.bankAccountName || 'البنك'} إلى ${transaction.cryptoWalletName || 'المحفظة'}`,
            timestamp: '...',
            isCompleted: transaction.status === 'Confirmed' || transaction.status === 'Cancelled',
            isCurrent: false,
        },
        {
            title: getStatusText(transaction.status),
            location: transaction.client_wallet_address ? `${transaction.client_wallet_address.substring(0, 6)}...` : 'محفظة العميل',
            description: transaction.status === 'Confirmed' ? 'تم تأكيد المعاملة بنجاح' : (transaction.status === 'Cancelled' ? 'تم إلغاء المعاملة' : 'في انتظار التأكيد النهائي'),
            timestamp: transaction.date ? format(new Date(transaction.date), "dd/MM/yyyy h:mm a") : 'N/A',
            isCompleted: transaction.status === 'Confirmed' || transaction.status === 'Cancelled',
            isCurrent: transaction.status === 'Confirmed' || transaction.status === 'Cancelled',
        }
    ];

    return (
        <Card ref={ref} className="w-full max-w-md bg-background text-foreground font-cairo p-4 md:p-6" dir="rtl">
            <div className="mb-6">
                <p className="text-sm text-muted-foreground">معرف التتبع</p>
                <h1 className="text-xl font-bold font-mono tracking-wider">{transaction.id}</h1>
                <p className="text-lg font-semibold">{client?.name || transaction.clientName}</p>
            </div>

            <div className="relative">
                {/* The vertical line */}
                <div className="absolute right-4 top-2 bottom-2 w-0.5 bg-muted-foreground/30"></div>
                
                <div className="space-y-8">
                    {steps.map((step, index) => {
                        const isLastStep = index === steps.length - 1;
                        const Icon = step.isCurrent && isLastStep ? CheckCircle2 : (step.isCompleted ? CircleDot : Circle);
                        
                        return (
                            <div key={index} className="flex gap-4 relative items-start">
                                <div className={cn(
                                    "z-10 flex h-8 w-8 items-center justify-center rounded-full",
                                    step.isCompleted ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                )}>
                                    <Icon className="h-5 w-5" />
                                </div>
                                <div className={cn(
                                    "flex-1 pt-1",
                                    step.isCurrent && isLastStep && "p-4 bg-primary/10 rounded-lg"
                                )}>
                                    <p className="font-bold text-sm uppercase">{step.title}</p>
                                    {step.location && <p className="text-sm text-muted-foreground">{step.location}</p>}
                                    <p className="text-sm mt-1">{step.description}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{step.timestamp}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Card>
    );
});
Invoice.displayName = 'Invoice';
