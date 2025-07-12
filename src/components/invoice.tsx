
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { User, Wallet, ArrowDown, Hash, Clock, FileText, ShieldAlert, CheckCircle } from 'lucide-react';
import { Separator } from "./ui/separator";

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const transactionDate = new Date(transaction.date);

    const formatAmount = (num: number, currency: string) => {
        return `${new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency}`;
    }

    const localAmountText = formatAmount(transaction.amount, transaction.currency);
    const usdtAmountText = transaction.amount_usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    const greetingText = `نوّرنا اليوم الأستاذ / ${client.name}، وأجرينا له معاملة ${isDeposit ? 'إيداع' : 'سحب'} مميزة.`;
    const paymentText = `قام بدفع مبلغ`;
    const bankText = `عبر حسابه في ${transaction.bankAccountName || 'حساب بنكي'}.`;
    const transferText = `وبالمقابل، تم تحويل`;
    const walletText = `إلى محفظته الرقمية USDT TRC20 التي تحمل العنوان التالي:`;
    const executionTimeText = `كل هذا تم خلال ثوانٍ معدودة من لحظة استلام المبلغ حتى وصوله للمحفظة.`;

    return (
        <div ref={ref} dir="rtl" className="w-full max-w-[761px] mx-auto bg-white text-gray-800 shadow-2xl rounded-xl font-cairo overflow-hidden border">
            {/* Header */}
            <header className="flex justify-between items-center p-6 bg-gray-50 border-b">
                <div className="flex items-center gap-4">
                    <CoinCashLogo className="w-20 h-20" />
                    <div>
                        <h1 className="text-2xl font-bold text-blue-900">كوين كاش للدفع الإلكتروني</h1>
                        <p className="text-sm mt-1 text-gray-500">صنعاء - شارع الخمسين</p>
                        <p className="text-sm mt-1 text-gray-500" dir="ltr">739032432 - 779331117</p>
                    </div>
                </div>
                <div className="text-left">
                    <h2 className="text-xl font-semibold text-gray-400">إشعار معاملة</h2>
                    <p className="font-mono text-xs text-gray-400 mt-1" dir="ltr">ID: {transaction.id}</p>
                     <p className="text-xs text-gray-400 mt-1">{format(transactionDate, "PPP p")}</p>
                </div>
            </header>

            {/* Body */}
            <main className="p-8 space-y-6">
                
                <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold text-green-600 flex items-center justify-center gap-2">
                        <CheckCircle className="h-6 w-6"/>
                        تم إنجاز المعاملة بنجاح
                    </h3>
                    <p className="text-gray-600 flex items-center justify-center gap-2">
                        <User className="h-5 w-5 text-gray-400"/>
                        {greetingText}
                    </p>
                </div>

                <Separator />

                {/* Financial Flow */}
                <div className="space-y-4 text-center">
                    {/* Source */}
                    <div className="p-4 bg-gray-50 rounded-lg border">
                        <p className="text-md text-gray-500">{paymentText}</p>
                        <p className="text-4xl font-bold my-2 text-blue-900" dir="ltr">{localAmountText}</p>
                        <p className="text-sm text-gray-500">{bankText}</p>
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                        <ArrowDown className="h-8 w-8 text-gray-300"/>
                    </div>
                    
                    {/* Destination */}
                    <div className="p-6 bg-green-50 rounded-lg border border-green-200">
                        <p className="text-lg text-green-800">{transferText}</p>
                        <p className="text-6xl font-black my-3 text-green-600" dir="ltr">
                            <span className="text-4xl align-middle font-semibold">USDT</span> {usdtAmountText}
                        </p>
                        <p className="text-sm text-green-700">{walletText}</p>
                        <p className="font-mono text-xs text-center bg-green-100 p-2 rounded-md mt-2 break-all" dir="ltr">{transaction.client_wallet_address}</p>
                    </div>
                </div>

                <Separator />

                {/* Details Section */}
                <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-3">
                        <Hash className="h-5 w-5 text-gray-400" />
                        <span className="font-bold text-gray-600">رقم توثيق الشبكة (Hash):</span>
                        <span className="font-mono text-xs text-gray-500 break-all" dir="ltr">{transaction.hash}</span>
                    </div>
                     <div className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-gray-400" />
                        <span className="font-bold text-gray-600">زمن التنفيذ:</span>
                        <span className="text-gray-500">{executionTimeText}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <span className="font-bold text-gray-600">ملاحظات النظام:</span>
                        <span className="text-gray-500">العملية موثّقة بالكامل وتم إصدار هذا الإشعار تلقائيًا من نظامنا الذكي. نسخة من التفاصيل محفوظة في حساب العميل، ومتاحة للمراجعة في أي وقت.</span>
                    </div>
                </div>

            </main>

            {/* Footer */}
            <footer className="mt-auto p-6 bg-amber-50 border-t border-amber-200">
                <div className="flex items-start gap-4 text-amber-900">
                    <ShieldAlert className="h-8 w-8 shrink-0 mt-1" />
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
