

'use client';

import type { Transaction, Client } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { Landmark, Wallet, XCircle, User, FileText, AlertTriangle, Repeat, Hash, CheckCircle, ArrowDown, ArrowUp, UserCircle } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Separator } from "./ui/separator";

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
    
    if (transaction.type === 'Withdraw') {
        steps.push({
            title: 'الطلب المستلم (سحب)',
            icon: Wallet,
            isCompleted: true,
            isCurrent: !isConfirmed && !isCancelled,
            timestamp: transactionTime,
            details: (
                 <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <ArrowUp className="h-5 w-5 text-red-500 flex-shrink-0" />
                        <p className="text-lg font-bold text-primary">{transaction.amount_usd.toFixed(2)} USDT</p>
                    </div>
                    <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                           <User className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <p><span className="text-muted-foreground">من:</span> <span className="font-semibold">{client?.name || transaction.clientName}</span></p>
                        </div>
                        <div className="flex items-start gap-2">
                           <Wallet className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <p><span className="text-muted-foreground">إلى محفظة النظام:</span> N/A</p>
                        </div>
                         <div className="flex items-start gap-2">
                            <Hash className="h-3 w-3 mt-0.5 text-muted-foreground" />
                            <div>
                                <p className="text-muted-foreground">معرّف العملية (Hash):</p>
                                <p className="font-mono break-all">N/A</p>
                            </div>
                        </div>
                    </div>
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
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <p className="text-lg font-bold text-green-600">{transaction.outflow_usd} Fiat</p>
                    </div>
                     <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                           <Landmark className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <p><span className="text-muted-foreground">إلى حساب:</span> N/A</p>
                        </div>
                        <div className="flex items-start gap-2">
                           <Repeat className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <div>
                                <p className="text-muted-foreground">رقم الحوالة:</p>
                                <p className="font-mono break-all">N/A</p>
                           </div>
                        </div>
                    </div>
                </div>
            )
        });
    } else { // Deposit
        steps.push({
            title: 'الطلب المستلم (إيداع)',
            icon: Landmark,
            isCompleted: true,
            isCurrent: !isConfirmed && !isCancelled,
            timestamp: transactionTime,
            details: (
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <ArrowDown className="h-5 w-5 text-green-500 flex-shrink-0" />
                        <p className="text-lg font-bold text-primary">{transaction.amount_usd} Fiat</p>
                    </div>
                     <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                           <User className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <p><span className="text-muted-foreground">من:</span> <span className="font-semibold">{client?.name || transaction.clientName}</span></p>
                        </div>
                         <div className="flex items-start gap-2">
                           <Landmark className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <p><span className="text-muted-foreground">عبر حساب:</span> N/A</p>
                        </div>
                        <div className="flex items-start gap-2">
                           <Repeat className="h-3 w-3 mt-0.5 text-muted-foreground" />
                           <div>
                                <p className="text-muted-foreground">رقم الحوالة:</p>
                                <p className="font-mono break-all">{transaction.remittance_number || 'N/A'}</p>
                           </div>
                        </div>
                    </div>
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
                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <p className="text-lg font-bold text-green-600">{transaction.outflow_usd.toFixed(2)} USDT</p>
                    </div>
                    <div className="space-y-2 text-xs">
                        <div className="flex items-start gap-2">
                            <Wallet className="h-3 w-3 mt-0.5 text-muted-foreground" />
                            <div>
                                <p><span className="text-muted-foreground">إلى المحفظة:</span></p>
                                <p className="font-mono break-all">N/A</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2">
                            <Hash className="h-3 w-3 mt-0.5 text-muted-foreground" />
                            <div>
                                <p className="text-muted-foreground">معرّف العملية (Hash):</p>
                                <p className="font-mono break-all">N/A</p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        });
    }
     
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
        <div ref={ref} dir="rtl" className="w-full max-w-md mx-auto bg-background text-foreground font-cairo">
            <div className="border border-border rounded-lg overflow-hidden">
                <div className="p-4 bg-muted/50">
                    <div className="text-center mb-4">
                        <p className="font-bold text-lg">كوين كاش</p>
                        <p className="text-xs text-muted-foreground">www.ycoincash.com</p>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-start mt-3 text-sm">
                        <div className="flex items-center gap-2">
                           <UserCircle className="h-5 w-5 text-primary" />
                            <div>
                                <p className="font-semibold">عزيزينا العميل</p>
                                <p className="text-xs text-muted-foreground">{client?.name || transaction.clientName}</p>
                                <p className="font-mono text-xs text-muted-foreground">{client?.id}</p>
                            </div>
                        </div>
                         <div className="flex items-center gap-2 text-left">
                            <div className="text-right">
                                <p className="font-semibold">Invoice ID</p>
                                <p className="font-mono text-xs text-muted-foreground">{transaction.id}</p>
                            </div>
                             <FileText className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                </div>

                <Alert variant="destructive" className="border-x-0 border-t-0 rounded-none bg-destructive/10 text-destructive text-justify">
                    <AlertTriangle className="h-5 w-5"/>
                    <AlertDescription className="text-xs leading-relaxed">
                        نحذّركم من إرسال أي مبلغ من محفظتكم لأي شخص أو جهة تدّعي تقديم أرباح أو استثمار مضمون، فهذه من الطرق الشائعة للاحتيال.
                        <br/>
                        ونؤكد بأن العملات الرقمية لا يمكن استرجاعها بعد إرسالها، ولن نتمكن من التدخل أو المساعدة في حال حدوث أي عملية غير آمنة.
                    </AlertDescription>
                </Alert>

                <div className="p-4">
                    <div className="relative pl-8 pr-4 py-4">
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
                                    <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md mt-2">
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
