
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Separator } from "./ui/separator";

const InfoRow = ({ label, value, valueClass, isMono = false }: { label: string, value: string | number | undefined | null, valueClass?: string, isMono?: boolean }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex justify-between items-center py-3 px-4 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={cn("font-semibold text-left break-all", isMono && "font-mono", valueClass)}>{String(value)}</dd>
        </div>
    );
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const formatCurrency = (value: number | undefined, currency: string) => {
        if (value === undefined) return '';
        return new Intl.NumberFormat('en-US').format(value) + ` ${currency}`;
    }

    const getStatusText = (status: Transaction['status']) => {
        switch (status) {
            case 'Confirmed': return 'مؤكد';
            case 'Cancelled': return 'ملغي';
            case 'Pending': return 'قيد الإنتظار';
            default: return status;
        }
    };
     const getStatusClass = (status: Transaction['status']) => {
        switch (status) {
            case 'Confirmed': return 'text-green-600';
            case 'Cancelled': return 'text-destructive';
            case 'Pending': return 'text-amber-600';
            default: return 'text-muted-foreground';
        }
    };

    const isDeposit = transaction.type === 'Deposit';

    return (
        <div ref={ref} dir="rtl" className="w-full max-w-md mx-auto bg-background text-foreground font-cairo">
            <Card className="border-primary/50 border-2 shadow-lg">
                <CardHeader className="text-center bg-muted/30">
                    <CardTitle className="text-xl">فاتورة عملية</CardTitle>
                    {client && (
                        <CardDescription className="pt-2">
                           <span className="font-bold text-lg text-foreground">{client.name}</span>
                           <br/>
                           <span className="font-mono text-xs text-muted-foreground">ID: {client.id}</span>
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    <dl className="divide-y">
                        <InfoRow label="رقم العملية" value={transaction.id} isMono />
                        <InfoRow label="التاريخ" value={transaction.date ? format(parseISO(transaction.date), "dd/MM/yyyy, h:mm a") : ''} />
                        <InfoRow label="نوع العملية" value={transaction.type === 'Deposit' ? 'إيداع' : 'سحب'} />
                        <InfoRow label="الحالة" value={getStatusText(transaction.status)} valueClass={getStatusClass(transaction.status)} />
                        
                        <Separator />
                        
                        <InfoRow label={isDeposit ? "المبلغ المستلم" : "المبلغ المرسل"} value={formatCurrency(transaction.amount, transaction.currency)} />
                        <InfoRow label="الرسوم" value={formatCurrency(transaction.fee_usd, 'USD')} />
                        {transaction.expense_usd && transaction.expense_usd > 0 ? (
                           <InfoRow label="مصاريف/خسارة" value={formatCurrency(transaction.expense_usd, 'USD')} valueClass="text-destructive" />
                        ) : null}
                         <InfoRow 
                            label={isDeposit ? "صافي الإيداع" : "إجمالي السحب"} 
                            value={formatCurrency(transaction.amount_usdt, 'USDT')} 
                            valueClass="text-primary font-bold"
                        />

                        <Separator />
                        
                        <InfoRow label="من حساب" value={transaction.bankAccountName || 'N/A'} />
                        <InfoRow label="إلى محفظة" value={transaction.cryptoWalletName || 'N/A'} />
                        <InfoRow label="محفظة العميل" value={transaction.client_wallet_address} isMono />

                        <Separator />
                        
                        <InfoRow label="رقم الحوالة" value={transaction.remittance_number} isMono />
                        <InfoRow label="معرف العملية (Hash)" value={transaction.hash} isMono />
                        <InfoRow label="ملاحظات" value={transaction.notes} />

                    </dl>
                </CardContent>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
