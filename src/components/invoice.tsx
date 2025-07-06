'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Card } from "@/components/ui/card";
import { CheckCircle2, Copy, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DetailRow = ({ label, value, canCopy = false }: { label: string, value: string | undefined, canCopy?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        toast({ title: "تم النسخ!", description: "تم نسخ النص إلى الحافظة." });
    };

    if (!value) return null;

    return (
        <div className="flex justify-between items-start py-3 border-b border-gray-100 last:border-b-0">
            <span className="text-sm text-gray-500 whitespace-nowrap">{label}</span>
            <div className="flex items-center gap-2 text-left">
                <span className="text-sm font-mono break-all">{value}</span>
                {canCopy && (
                    <button onClick={handleCopy} className="text-gray-400 hover:text-gray-600 shrink-0">
                        <Copy size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};


const StatusBadge = ({ status }: { status: Transaction['status'] }) => {
    switch (status) {
        case 'Confirmed':
            return (
                <div className="flex items-center gap-1.5 text-green-600">
                    <CheckCircle2 size={20} />
                    <span className="font-semibold">مكتمل</span>
                </div>
            );
        case 'Pending':
             return (
                <div className="flex items-center gap-1.5 text-yellow-600">
                    <Clock size={20} />
                    <span className="font-semibold">قيد الإنتظار</span>
                </div>
            );
        case 'Cancelled':
            return (
                <div className="flex items-center gap-1.5 text-red-600">
                    <XCircle size={20} />
                    <span className="font-semibold">ملغاة</span>
                </div>
            );
        default:
            return null;
    }
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const transactionTitle = transaction.type === 'Deposit' ? 'تفاصيل الإيداع' : 'تفاصيل السحب';
    const amountPrefix = transaction.type === 'Deposit' ? '+' : '-';
    const amountColor = transaction.type === 'Deposit' ? 'text-green-600' : 'text-red-600';
    const formattedDate = transaction.date && !isNaN(new Date(transaction.date).getTime())
        ? format(new Date(transaction.date), 'yyyy-MM-dd HH:mm:ss')
        : 'N/A';
    
    const transactionTypeArabic = transaction.type === 'Deposit' ? 'إيداع' : 'سحب';

    return (
        <div ref={ref} dir="rtl" className="bg-white font-sans text-gray-800 p-4">
            <Card className="w-full max-w-md mx-auto shadow-lg rounded-xl overflow-hidden">
                <div className="p-6 space-y-6">
                    <header className="text-center">
                        <h1 className="text-xl font-bold">{transactionTitle}</h1>
                    </header>

                    <section className="text-center space-y-2">
                        <p className={`text-4xl font-bold ${amountColor}`}>{`${amountPrefix}${transaction.amount_usdt.toFixed(2)} USDT`}</p>
                        <div className="flex justify-center">
                           <StatusBadge status={transaction.status} />
                        </div>
                    </section>

                    <section className="text-center text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                        <p>
                           عزيزي العميل <span className="font-bold">{client.name}</span>، لقد قمت بإجراء معاملة <span className="font-bold">{transactionTypeArabic}</span>. 
                           وهنا تفاصيل العملية:
                        </p>
                    </section>
                    
                    <section>
                        <DetailRow label="الشبكة" value="BEP20 (Binance Smart Chain)" />
                        <DetailRow label="العنوان" value={transaction.client_wallet_address} canCopy />
                        <DetailRow label="Txid" value={transaction.hash} canCopy />
                        <DetailRow label="المحفظة" value={transaction.cryptoWalletName} />
                        <DetailRow label="التاريخ" value={formattedDate} />
                    </section>
                </div>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
