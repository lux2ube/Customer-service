
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

const InfoRow = ({ label, value, isMono = false, isLtr = false }: { label: string, value: string | number | undefined | null, isMono?: boolean, isLtr?: boolean }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex justify-between items-center text-sm py-3 px-4">
            <span className="font-semibold text-muted-foreground">{label}</span>
            <p className={cn(
                "font-bold text-foreground/90 text-left break-words", 
                isMono && "font-mono tracking-tighter",
                isLtr && "dir-ltr"
            )}>
                {value}
            </p>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const formattedDate = format(transactionDate, "PPP p");

    const getStatusText = (status: Transaction['status']) => {
        switch(status) {
            case 'Confirmed': return 'مؤكدة';
            case 'Pending': return 'قيد الانتظار';
            case 'Cancelled': return 'ملغاة';
            default: return status;
        }
    }
    
    const getStatusVariant = (status: Transaction['status']) => {
        switch(status) {
            case 'Confirmed': return 'text-green-500';
            case 'Pending': return 'text-yellow-500';
            case 'Cancelled': return 'text-red-500';
            default: return 'text-muted-foreground';
        }
    }

    return (
        <div ref={ref} className="w-full max-w-md mx-auto bg-background text-foreground font-cairo p-4" dir="rtl">
            <Card className="rounded-2xl shadow-lg border-2 border-primary/10">
                <div className="bg-gradient-to-b from-primary/80 to-primary p-6 text-center rounded-t-2xl text-primary-foreground">
                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-white/90" strokeWidth={1.5} />
                    <h2 className="text-2xl font-bold">تمت العملية بنجاح</h2>
                    <p className="opacity-80 mt-1">{formattedDate}</p>
                </div>
                <CardContent className="p-0">
                    <div className="py-4">
                        <h3 className="text-center font-bold text-lg text-primary">تفاصيل العملية</h3>
                    </div>
                    
                    <div className="divide-y divide-border/50">
                        <InfoRow label="العميل" value={client?.name || transaction.clientName} />
                        <InfoRow label="نوع العملية" value={transaction.type === 'Deposit' ? 'إيداع' : 'سحب'} />
                        <InfoRow label="الحالة" value={<span className={cn('font-bold', getStatusVariant(transaction.status))}>{getStatusText(transaction.status)}</span>} />
                        <InfoRow label="الحساب" value={transaction.bankAccountName || transaction.cryptoWalletName} />
                    </div>

                    <div className="bg-muted/30 py-4 mt-4">
                        <h3 className="text-center font-bold text-lg text-primary">المبالغ المالية</h3>
                    </div>

                     <div className="divide-y divide-border/50">
                        <InfoRow label={`المبلغ (${transaction.currency})`} value={transaction.amount.toLocaleString()} isMono />
                        <InfoRow label="المبلغ (USD)" value={transaction.amount_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono isLtr />
                        <InfoRow label="الرسوم (USD)" value={transaction.fee_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono isLtr />
                        {transaction.expense_usd && transaction.expense_usd > 0 ? (
                            <InfoRow label="مصروف / خسارة (USD)" value={transaction.expense_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} isMono isLtr />
                        ): null}
                        <InfoRow label="المبلغ النهائي (USDT)" value={`${transaction.amount_usdt.toLocaleString()} USDT`} isMono isLtr />
                    </div>

                    {(transaction.notes || transaction.hash || transaction.client_wallet_address || transaction.remittance_number) && (
                        <>
                        <div className="bg-muted/30 py-4 mt-4">
                            <h3 className="text-center font-bold text-lg text-primary">معلومات إضافية</h3>
                        </div>
                        <div className="divide-y divide-border/50">
                           {transaction.notes && <InfoRow label="ملاحظات" value={transaction.notes} />}
                           {transaction.remittance_number && <InfoRow label="رقم الحوالة" value={transaction.remittance_number} isMono isLtr />}
                           {transaction.hash && <InfoRow label="معرف العملية (Hash)" value={transaction.hash} isMono isLtr />}
                           {transaction.client_wallet_address && <InfoRow label="محفظة العميل" value={transaction.client_wallet_address} isMono isLtr />}
                        </div>
                        </>
                    )}

                    <div className="text-center p-6 text-muted-foreground text-xs font-mono tracking-widest" dir="ltr">
                        TXN ID: {transaction.id}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
