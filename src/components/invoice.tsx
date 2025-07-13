
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Button } from "./ui/button";
import Link from "next/link";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";

const InfoRow = ({ label, value, isMono = false }: { label: string, value: string | number | undefined | null, isMono?: boolean }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex justify-between items-center py-3.5 px-4 text-sm">
            <span className={cn("font-semibold", isMono ? 'font-mono' : 'font-body')}>{value}</span>
            <span className="text-muted-foreground">{label}</span>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const amountUSDT = transaction.amount_usdt || 0;

    const formattedDate = format(transactionDate, "yyyy-MM-dd HH:mm:ss");

    const getStatusText = (status: Transaction['status']) => {
        switch(status) {
            case 'Confirmed': return 'مكتمل';
            case 'Pending': return 'قيد الانتظار';
            case 'Cancelled': return 'ملغاة';
            default: return status;
        }
    }

    return (
        <div ref={ref} className="w-full max-w-sm mx-auto bg-background text-foreground font-cairo">
            <div className="p-4 md:p-6 space-y-6">
                
                <div className="text-center space-y-4">
                     <div className="inline-block p-1 bg-green-100 dark:bg-green-900/50 rounded-full">
                        <div className="p-2 bg-green-500 rounded-full">
                           <CheckCircle className="h-8 w-8 text-white" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        تم الإرسال بنجاح
                    </h1>
                     <p className="text-sm text-muted-foreground">
                        لقد دفعت {amountUSDT.toFixed(2)} USDT بنجاح
                    </p>
                </div>
                
                <Card className="overflow-hidden">
                    <CardContent className="divide-y p-0">
                        <InfoRow label="وضع الإرسال" value={getStatusText(transaction.status)} />
                        <InfoRow label="إلى" value={client?.name || transaction.clientName} />
                        <InfoRow label="المبلغ الإجمالي" value={`${amountUSDT.toFixed(2)} USDT`} />
                        <InfoRow label="مبلغ الاستلام" value={`${amountUSDT.toFixed(2)} USDT`} />
                        <InfoRow label="إرسال من" value={transaction.cryptoWalletName || transaction.bankAccountName} />
                        <InfoRow label="ملاحظة" value={transaction.notes || '--'} />
                        <InfoRow label="التاريخ" value={formattedDate} isMono />
                        <InfoRow label="معرّف العملية" value={transaction.id.slice(-12)} isMono />
                    </CardContent>
                </Card>

                 <div className="pt-4">
                     <Button asChild className="w-full h-12 text-base" variant="secondary">
                        <Link href="/transactions">سجل العرض</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
