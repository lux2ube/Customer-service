
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { User, Wallet, Hash, CheckCircle, BrainCircuit, FileText, Landmark, Banknote, Calendar, Phone, ArrowLeftRight, Clock, Info, ShieldCheck } from 'lucide-react';
import { ar } from 'date-fns/locale';

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const transactionDate = new Date(transaction.date);

    const formatAmount = (num: number) => {
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    }
    
    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-gray-50 font-cairo p-6 flex flex-col justify-between">
            <div>
                {/* Header */}
                <header className="flex justify-between items-center pb-4 border-b-2 border-gray-100">
                    <div className="text-right">
                        <h2 className="text-2xl font-bold text-blue-900">كوين كاش للدفع الإلكتروني</h2>
                        <p className="text-sm mt-1 text-gray-600">صنعاء - شارع الخمسين</p>
                    </div>
                    <div className="text-left">
                        <CoinCashLogo className="w-28 h-28" />
                    </div>
                </header>
            
                <main className="py-5 space-y-3">
                    {/* Success Message */}
                    <h1 className="text-center text-2xl font-bold text-green-700 mb-4">
                        🧾 تم إنجاز المعاملة بنجاح ✅
                    </h1>

                    {/* Greeting */}
                    <p className="text-center text-lg text-gray-700">
                        ✨ نوّرنا اليوم الأستاذ / {client.name}، وأجرينا له معاملة {isDeposit ? 'إيداع' : 'سحب'} مميزة.
                    </p>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        {/* Payment Details */}
                        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                            <p className="text-gray-800 text-base">
                                📥 قام بدفع مبلغ <span className="font-bold text-lg text-blue-800">💴 {formatAmount(transaction.amount)} {transaction.currency}</span> عبر حسابه في <span className="font-bold">{transaction.bankAccountName || 'حساب بنكي'}</span>.
                            </p>
                        </div>
                        
                        {/* Transfer Details */}
                        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                            <p className="text-gray-800 text-base">
                                🔁 وبالمقابل، تم تحويل <span className="font-bold text-lg text-green-700">{formatAmount(transaction.amount_usdt)} USDT</span> إلى محفظته الرقمية <span className="font-bold">{transaction.cryptoWalletName || 'USDT TRC20'}</span>.
                            </p>
                        </div>
                    </div>
                    
                    {/* Wallet Address */}
                    <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <p className="text-gray-800 mb-1">التي تحمل العنوان التالي:</p>
                        <p className="font-mono text-sm text-center bg-gray-100 p-2 rounded break-all" dir="ltr">{transaction.client_wallet_address}</p>
                    </div>

                    {/* Blockchain Info */}
                     <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <p className="text-gray-800 mb-1">🔗 المعاملة تم تنفيذها عبر شبكة البلوك تشين، وصدرت برقم التوثيق (Hash):</p>
                        <p className="font-mono text-xs text-center bg-gray-100 p-2 rounded break-all" dir="ltr">{transaction.hash}</p>
                    </div>

                    {/* Execution Time */}
                    <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                        <p className="text-center text-gray-800">
                            ⏱️ كل هذا تم خلال <span className="font-bold">90 ثانية فقط</span> من لحظة استلام المبلغ حتى وصوله للمحفظة.
                        </p>
                    </div>

                     {/* System Notes */}
                    <div className="text-center text-sm text-gray-500 pt-3">
                         <p>---</p>
                         <p>📌 العملية موثّقة بالكامل وتم إصدار هذا الإشعار تلقائيًا من نظامنا الذكي.</p>
                         <p>📂 نسخة من التفاصيل محفوظة في حساب العميل، ومتاحة للمراجعة في أي وقت.</p>
                    </div>

                </main>
            </div>
            
            {/* Footer */}
            <footer className="mt-auto pt-4 border-t-2 border-dashed border-gray-300 text-center bg-blue-50 p-3 rounded-lg">
                <h3 className="font-bold text-blue-800 flex items-center justify-center gap-2">🧠 نصيحة ببلاش:</h3>
                <div className="text-sm text-gray-700 mt-2 space-y-1">
                    <p>بعد ما يوصل المبلغ لمحفظتك، صار تحت مسؤوليتك الكاملة.</p>
                    <p>🚫 لا تصدق أي واحد يقول لك "استثمار مضمون" أو "ضاعف رصيدك"، هذي أول خطوات الخسارة.</p>
                    <p>افهم قبل ما تدفع، وفكّر قبل ما تندفع.</p>
                </div>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
