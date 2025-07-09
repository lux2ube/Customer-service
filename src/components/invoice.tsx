'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { UserCircle, Wallet, Hash, Landmark, CheckCircle, Clock, Link as LinkIcon, Info, AlertTriangle } from 'lucide-react';
import { Separator } from "./ui/separator";

// A helper component for creating styled sections
const InfoSection = ({ icon, title, children, className }: { icon: React.ElementType, title?: string, children: React.ReactNode, className?: string }) => {
    const Icon = icon;
    return (
        <div className={cn("flex items-start gap-4 p-4 rounded-lg bg-white border border-gray-100", className)}>
            <Icon className="h-6 w-6 text-primary mt-1 shrink-0" />
            <div className="flex-1">
                {title && <h3 className="font-semibold text-gray-500 mb-1">{title}</h3>}
                <div className="text-gray-700 leading-relaxed">{children}</div>
            </div>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const transactionDate = new Date(transaction.date);

    const formatAmount = (num: number, currency: string) => {
        return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency}`;
    }

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-gray-50 font-cairo p-8 flex flex-col justify-between text-gray-800">
            {/* Main Content Area */}
            <div>
                {/* Header */}
                <header className="flex justify-between items-center pb-6 border-b-2 border-gray-200">
                    <div className="flex items-center gap-4">
                        <CoinCashLogo className="w-20 h-20" />
                        <div>
                            <h1 className="text-3xl font-bold text-blue-900">كوين كاش للدفع الإلكتروني</h1>
                            <p className="text-sm mt-1 text-gray-600">صنعاء - شارع الخمسين</p>
                        </div>
                    </div>
                    <div className="text-left">
                        <h2 className="text-2xl font-semibold text-gray-500">إشعار معاملة</h2>
                        <p className="font-mono text-xs text-gray-400 mt-1" dir="ltr">ID: {transaction.id}</p>
                    </div>
                </header>

                {/* Body */}
                <main className="py-8 space-y-5">
                    <div className="flex items-center justify-center gap-3 text-2xl font-bold text-green-600 bg-green-50 p-4 rounded-lg">
                        <CheckCircle className="h-8 w-8"/>
                        <h1>تم إنجاز المعاملة بنجاح</h1>
                    </div>

                    <InfoSection icon={UserCircle}>
                        <p>نوّرنا اليوم الأستاذ / <span className="font-bold">{client.name}</span>، وأجرينا له معاملة {isDeposit ? 'إيداع' : 'سحب'} مميزة.</p>
                    </InfoSection>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                         <InfoSection icon={Landmark}>
                            <p>قام بدفع مبلغ <span className="font-bold text-lg">{formatAmount(transaction.amount, transaction.currency)}</span> عبر حسابه في <span className="font-bold">{transaction.bankAccountName || 'حساب بنكي'}</span>.</p>
                        </InfoSection>

                        <InfoSection icon={Wallet}>
                             <p>وبالمقابل، تم تحويل <span className="font-bold text-lg text-green-600">{formatAmount(transaction.amount_usdt, 'USDT')}</span> إلى محفظته الرقمية USDT TRC20 التي تحمل العنوان التالي:</p>
                             <p className="font-mono text-xs text-center bg-gray-100 p-2 rounded-md mt-2 break-all" dir="ltr">{transaction.client_wallet_address}</p>
                        </InfoSection>
                    </div>

                    <InfoSection icon={LinkIcon}>
                        <p>المعاملة تم تنفيذها عبر شبكة البلوك تشين، وصدرت برقم التوثيق (Hash):</p>
                        <p className="font-mono text-xs text-center bg-gray-100 p-2 rounded-md mt-2 break-all" dir="ltr">{transaction.hash}</p>
                    </InfoSection>

                    <InfoSection icon={Clock}>
                         <p>كل هذا تم خلال <span className="font-bold">ثوانٍ معدودة</span> من لحظة استلام المبلغ حتى وصوله للمحفظة.</p>
                    </InfoSection>

                    <Separator className="my-6"/>

                     <InfoSection icon={Info}>
                        <p className="font-semibold">العملية موثّقة بالكامل وتم إصدار هذا الإشعار تلقائيًا من نظامنا الذكي.</p>
                        <p className="text-sm text-gray-500 mt-1">نسخة من التفاصيل محفوظة في حساب العميل، ومتاحة للمراجعة في أي وقت.</p>
                    </InfoSection>
                </main>
            </div>

            {/* Footer */}
            <footer className="mt-auto">
                <div className="flex items-start gap-4 p-4 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                    <AlertTriangle className="h-8 w-8 shrink-0 mt-1" />
                    <div>
                        <h3 className="font-bold mb-2">نصيحة ببلاش:</h3>
                        <div className="text-sm space-y-1">
                            <p>بعد ما يوصل المبلغ لمحفظتك، صار تحت مسؤوليتك الكاملة.</p>
                            <p>لا تصدق أي واحد يقول لك "استثمار مضمون" أو "ضاعف رصيدك"، هذي أول خطوات الخسارة.</p>
                            <p className="font-semibold mt-2">افهم قبل ما تدفع، وفكّر قبل ما تندفع.</p>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
