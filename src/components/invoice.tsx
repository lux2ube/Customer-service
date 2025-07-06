
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { Card } from "@/components/ui/card";
import { CheckCircle2, Copy, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DetailRow = ({ label, value, canCopy = false }: { label: string, value: string | undefined | number, canCopy?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(String(value));
        toast({ title: "تم النسخ!", description: "تم نسخ النص إلى الحافظة." });
    };

    if (value === undefined || value === null || value === '') return null;

    return (
        <div className="flex justify-between items-start py-3 border-b border-gray-100 last:border-b-0">
            <span className="text-sm text-gray-500 whitespace-nowrap">{label}</span>
            <div className="flex items-center gap-2 text-left">
                <span className="text-sm font-mono break-all">{String(value)}</span>
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

    const formatLocalCurrency = (value: number, currency: string) => {
        return new Intl.NumberFormat('en-US').format(value) + ` ${currency}`;
    }

    const formatUsd = (value: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    }
    
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
                        <h2 className="text-lg font-semibold border-b pb-2 mb-2">التفاصيل المالية</h2>
                        <DetailRow label="المبلغ" value={formatLocalCurrency(transaction.amount, transaction.currency)} />
                        <DetailRow label="المبلغ (USD)" value={formatUsd(transaction.amount_usd)} />
                        <DetailRow label="الرسوم (USD)" value={formatUsd(transaction.fee_usd)} />
                        {transaction.expense_usd && transaction.expense_usd > 0 && (
                            <DetailRow label="مصاريف/خسارة (USD)" value={formatUsd(transaction.expense_usd)} />
                        )}
                        <DetailRow label="المبلغ النهائي (USDT)" value={`${transaction.amount_usdt.toFixed(2)} USDT`} />
                    </section>
                    
                    <section>
                        <h2 className="text-lg font-semibold border-b pb-2 mb-2">تفاصيل العملية</h2>
                        <DetailRow label="الحساب البنكي" value={transaction.bankAccountName} />
                        <DetailRow label="المحفظة" value={transaction.cryptoWalletName} />
                        <DetailRow label="رقم الحوالة" value={transaction.remittance_number} />
                        <DetailRow label="الشبكة" value="BEP20 (BSC)" />
                        <DetailRow label="عنوان العميل" value={transaction.client_wallet_address} canCopy />
                        <DetailRow label="رمز العملية (Txid)" value={transaction.hash} canCopy />
                        <DetailRow label="التاريخ" value={formattedDate} />
                    </section>

                    {transaction.notes && (
                        <section>
                            <h2 className="text-lg font-semibold border-b pb-2 mb-2">ملاحظات</h2>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">{transaction.notes}</p>
                        </section>
                    )}
                </div>
            </Card>
        </div>
    );
});
Invoice.displayName = 'Invoice';
