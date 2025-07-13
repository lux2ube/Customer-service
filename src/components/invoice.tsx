
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Button } from "./ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "./ui/card";

const InfoRow = ({ label, value, valueClassName }: { label: string, value: string | number | undefined | null, valueClassName?: string }) => {
    if (value === undefined || value === null || value === '') return null;
    
    // Check if the value contains multiple lines (for the notes)
    const isMultiline = typeof value === 'string' && value.includes('\n');

    return (
        <div className={cn("flex justify-between items-start py-4 px-4 text-sm", isMultiline && 'flex-col items-end')}>
            <div className={cn("text-right font-medium", valueClassName)}>
                 {isMultiline 
                    ? value.split('\n').map((line, index) => <p key={index}>{line}</p>)
                    : <p>{value}</p>
                 }
            </div>
            <span className="text-muted-foreground whitespace-nowrap">{label}</span>
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
    
    const sender = transaction.cryptoWalletName || transaction.bankAccountName || 'USDT BEP20';
    const transactionIdShort = transaction.id.slice(-12).toUpperCase();
    
    // The "Synced from BscScan" note can be part of the main notes or constructed
    const notesToDisplay = transaction.notes?.startsWith('Synced from BscScan')
        ? transaction.notes.replace(/\.\s/g, '.\n') // Add line breaks after periods for better layout
        : transaction.notes;


    return (
        <div ref={ref} className="w-full max-w-sm mx-auto bg-background text-foreground font-cairo">
            <div className="p-4 md:p-6 space-y-6">
                
                <div className="text-center space-y-4 pt-8">
                     <div className="inline-block p-3 bg-green-100 dark:bg-green-900/50 rounded-full">
                        <div className="h-10 w-10 bg-green-200 dark:bg-green-800/50 rounded-full" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        تم الإرسال بنجاح
                    </h1>
                     <p className="text-sm text-muted-foreground/80" dir="rtl">
                        لقد دفعت {amountUSDT.toFixed(2)} USDT بنجاح
                    </p>
                </div>
                
                <Card className="overflow-hidden shadow-none border">
                    <CardContent className="divide-y p-0">
                        <InfoRow label="وضع الإرسال" value={getStatusText(transaction.status)} />
                        <InfoRow label="إلى" value={client?.name || transaction.clientName} />
                        <InfoRow label="المبلغ الإجمالي" value={`${amountUSDT.toFixed(2)} USDT`} />
                        <InfoRow label="مبلغ الاستلام" value={`${amountUSDT.toFixed(2)} USDT`} />
                        <InfoRow label="إرسال من" value={sender} />
                        {notesToDisplay && <InfoRow label="ملاحظة" value={notesToDisplay} valueClassName="text-xs" />}
                        <InfoRow label="التاريخ" value={formattedDate} valueClassName="font-mono" />
                        <InfoRow label="معرّف العملية" value={transactionIdShort} valueClassName="font-mono" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
