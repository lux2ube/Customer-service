
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle, Wallet, FileText, Hash, Clock, Landmark, AlertTriangle, Lightbulb } from 'lucide-react';

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {

    const isDeposit = transaction.type === 'Deposit';

    const getCurrencyName = (currencyCode: string) => {
        switch(currencyCode?.toUpperCase()) {
            case 'YER': return 'ريال يمني';
            case 'SAR': return 'ريال سعودي';
            case 'USD': return 'دولار أمريكي';
            case 'USDT': return 'USDT';
            default: return currencyCode || '';
        }
    }

    const formatNumber = (value: number | undefined) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US', {useGrouping: true}).format(value);
    }

    const formattedDate = format(new Date(transaction.date), 'yyyy-MM-dd');
    const formattedTime = format(new Date(transaction.date), 'hh:mm a');

    // Deposit Message Logic
    const depositMessage = (
        <>
            <p className="text-xl">
                ✨ نوّرنا اليوم الأستاذ / {client.name}،
                وأجرينا له معاملة إيداع مميزة.
            </p>
            <p className="mt-4 text-xl">
                📥 قام بدفع مبلغ 💴 <span className="font-bold">{formatNumber(transaction.amount)} {getCurrencyName(transaction.currency)}</span>
                <br/>
                عبر حسابه في <span className="font-bold">{transaction.bankAccountName || 'حساب بنكي'}</span>.
            </p>
            <p className="mt-4 text-xl">
                🔁 وبالمقابل، تم تحويل <span className="font-bold text-green-600">{formatNumber(transaction.amount_usdt)} USDT</span>
                <br />
                إلى محفظته الرقمية التي تحمل العنوان التالي:
                <br />
                <code className="text-sm font-mono bg-gray-100 p-2 rounded-md block text-center my-2 break-all" dir="ltr">{transaction.client_wallet_address || 'N/A'}</code>
            </p>
        </>
    );

    // Withdraw Message Logic
    const withdrawMessage = (
        <>
            <p className="text-xl">
                ✨ تشرفنا بخدمة الأستاذ / {client.name}،
                وأجرينا له معاملة سحب مميزة.
            </p>
            <p className="mt-4 text-xl">
                📥 قام بإرسال مبلغ <span className="font-bold">{formatNumber(transaction.amount_usdt)} USDT</span>
                <br/>
                من محفظته الرقمية التي تحمل العنوان:
                <br/>
                <code className="text-sm font-mono bg-gray-100 p-2 rounded-md block text-center my-2 break-all" dir="ltr">{transaction.client_wallet_address || 'N/A'}</code>
            </p>
            <p className="mt-4 text-xl">
                🔁 وبالمقابل، تم إيداع 💴 <span className="font-bold text-green-600">{formatNumber(transaction.amount)} {getCurrencyName(transaction.currency)}</span>
                <br />
                في حسابه لدى <span className="font-bold">{transaction.bankAccountName || 'حساب بنكي'}</span>.
            </p>
        </>
    );

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-white shadow-xl font-cairo border-2 border-gray-200 mx-auto p-8 text-gray-800 flex flex-col">
            <header className="text-center mb-8">
                <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
                    <FileText className="text-green-500" size={32}/>
                    تم إنجاز المعاملة بنجاح
                    <CheckCircle className="text-green-500" size={32}/>
                </h1>
            </header>

            <main className="flex-grow text-right leading-loose">
                {isDeposit ? depositMessage : withdrawMessage}

                <div className="mt-6 text-xl">
                    <p className="flex items-center gap-2">
                        <Hash size={20} className="text-blue-500"/>
                        <span>رقم توثيق الشبكة (Hash):</span>
                    </p>
                    <code className="text-sm font-mono bg-gray-100 p-2 rounded-md block text-center my-2 break-all" dir="ltr">
                        {transaction.hash || 'N/A'}
                    </code>
                </div>

                <div className="mt-2 text-xl flex items-center gap-2">
                    <Clock size={20} className="text-blue-500"/>
                    <span>تم التنفيذ بسرعة فائقة.</span>
                </div>

                <hr className="my-8 border-gray-300 border-dashed" />

                <div className="text-lg">
                    <p className="flex items-center gap-2 font-semibold"><Wallet size={20}/> العملية موثّقة بالكامل وتم إصدار هذا الإشعار تلقائيًا.</p>
                    <p className="flex items-center gap-2 mt-2"><Landmark size={20}/> نسخة من التفاصيل محفوظة في حساب العميل للمراجعة.</p>
                </div>

                <div className="mt-8 p-4 bg-yellow-50 border-r-4 border-yellow-400">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Lightbulb className="text-yellow-500"/> نصيحة من القلب:</h3>
                    <p className="mt-2 text-md">
                        بعد وصول المبلغ لمحفظتك، يصبح تحت مسؤوليتك الكاملة.
                        <br/>
                        <span className="font-bold text-red-600">🚫 لا تصدق أي شخص</span> يعدك بـ "استثمار مضمون" أو "مضاعفة رصيدك"، فهذه هي أولى خطوات الخسارة.
                        <br/>
                        افهم قبل أن تدفع، وفكّر قبل أن تندفع.
                    </p>
                </div>

            </main>

            <footer className="text-center text-sm text-gray-500 mt-auto">
                 <p>{formattedDate} - {formattedTime}</p>
                 <p className="mt-1">كوين كاش للدفع الإلكتروني</p>
            </footer>

        </div>
    );
});
Invoice.displayName = 'Invoice';
