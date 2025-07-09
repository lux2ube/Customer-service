
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { User, Wallet, Hash, CheckCircle, BrainCircuit, FileText, Landmark } from 'lucide-react';

const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];

function convertHundreds(n: number): string {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    const unit = n % 10;
    const ten = Math.floor(n / 10);
    let result = tens[ten];
    if (unit > 0) {
        result = ones[unit] + ' و' + result;
    }
    return result;
}

function convertThousands(n: number): string {
    if (n < 100) return convertHundreds(n);
    if (n < 1000) {
        const hundred = Math.floor(n / 100);
        const remainder = n % 100;
        let result = '';
        if (hundred === 1) result = 'مئة';
        else if (hundred === 2) result = 'مئتان';
        else result = ones[hundred] + ' مئة';
        
        if (remainder > 0) {
            result += ' و' + convertHundreds(remainder);
        }
        return result;
    }
    return '';
}

function tafqeet(num: number, currency: string): string {
    if (num === 0) return 'صفر';
    const number = Math.floor(num);

    const currencies = {
        YER: { single: 'ريال يمني', plural: 'ريالاً يمنياً' },
        SAR: { single: 'ريال سعودي', plural: 'ريالاً سعودياً' },
        USD: { single: 'دولار أمريكي', plural: 'دولاراً أمريكياً' },
        USDT: { single: 'USDT', plural: 'USDT' }
    };
    const selectedCurrency = currencies[currency as keyof typeof currencies] || { single: currency, plural: currency };
    
    let words = [];
    
    const millions = Math.floor(number / 1000000);
    if (millions > 0) {
        words.push(convertThousands(millions) + ' مليون');
    }
    
    const thousands = Math.floor((number % 1000000) / 1000);
    if (thousands > 0) {
        if (thousands === 1) words.push('ألف');
        else if (thousands === 2) words.push('ألفان');
        else if (thousands > 2 && thousands < 11) words.push(convertHundreds(thousands) + ' آلاف');
        else words.push(convertHundreds(thousands) + ' ألف');
    }
    
    const remainder = number % 1000;
    if (remainder > 0) {
        words.push(convertThousands(remainder));
    }
    
    return `فقط ${words.join(' و')} ${selectedCurrency.plural} لا غير.`;
}


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {

    const isDeposit = transaction.type === 'Deposit';
    const formattedDate = format(new Date(transaction.date), 'yyyy-MM-dd');
    const formattedTime = format(new Date(transaction.date), 'hh:mm a');

    const formatNumber = (value: number | undefined | null) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US', {useGrouping: true, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-white shadow-xl font-cairo border-2 border-gray-200 mx-auto p-6 flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center pb-4 border-b-2 border-primary">
                <div className="text-right">
                    <h2 className="text-xl font-bold text-primary">كوين كاش للدفع الإلكتروني</h2>
                    <p className="text-sm text-gray-600 mt-1">صنعاء - شارع الخمسين</p>
                </div>
                <div className="text-left">
                     <CoinCashLogo className="w-20 h-20" />
                     <p className="text-sm text-gray-600 mt-1 font-mono">739032432 - 779331117</p>
                </div>
            </header>

            {/* Title */}
            <section className="text-center my-6">
                <h1 className="text-2xl font-bold bg-primary text-primary-foreground py-2 px-4 rounded-lg inline-flex items-center gap-2">
                    <CheckCircle />
                    إشعار معاملة {isDeposit ? 'إيداع' : 'سحب'}
                </h1>
                <p className="text-xs text-gray-500 mt-2">
                    {formattedDate} | {transaction.id}
                </p>
            </section>
            
            <main className="flex-grow space-y-4">

                {/* Client Greeting */}
                <div className="text-center text-lg bg-gray-50 p-3 rounded-lg border">
                    <p>✨ أهلاً وسهلاً بـ <span className="font-bold">{client.name}</span>، تم تنفيذ معاملتك بنجاح.</p>
                </div>

                {/* What was SENT */}
                <div className="border rounded-lg p-4 space-y-2 bg-blue-50">
                    <h3 className="font-bold text-primary flex items-center gap-2"><Landmark size={20}/> ما قمت بإرساله:</h3>
                    <p className="text-lg">
                        قمت بدفع مبلغ <span className="font-bold font-mono text-blue-800">💴 {formatNumber(transaction.amount)} {transaction.currency}</span>
                    </p>
                    <p className="text-sm text-gray-600">
                        من حسابك في: <span className="font-semibold">{transaction.bankAccountName || 'غير محدد'}</span>
                    </p>
                </div>

                {/* What was RECEIVED */}
                <div className="border rounded-lg p-4 space-y-2 bg-green-50">
                     <h3 className="font-bold text-green-700 flex items-center gap-2"><Wallet size={20}/> ما تم استلامه في المقابل:</h3>
                    <p className="text-lg">
                        تم تحويل مبلغ <span className="font-bold font-mono text-green-800">{formatNumber(transaction.amount_usdt)} USDT</span>
                    </p>
                     <p className="text-sm text-gray-600">
                        إلى محفظتك الرقمية <span className="font-semibold">USDT BEP20</span> بالعنوان:
                     </p>
                    <p className="font-mono text-xs text-left break-all bg-gray-100 p-2 rounded-md" dir="ltr">{transaction.client_wallet_address || 'غير محدد'}</p>
                </div>
                
                {/* Hash Details */}
                <div className="border rounded-lg p-4 space-y-2">
                    <h3 className="font-bold flex items-center gap-2"><Hash size={20} /> تفاصيل الشبكة:</h3>
                    <p className="text-sm text-gray-600">المعاملة تم تنفيذها عبر شبكة البلوك تشين، وصدرت برقم التوثيق (Hash):</p>
                    <p className="font-mono text-xs text-left break-all bg-gray-100 p-2 rounded-md" dir="ltr">{transaction.hash || 'غير متوفر'}</p>
                </div>
                
                {/* Notes & Advice */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border rounded-lg p-4 bg-gray-50 text-sm">
                        <h3 className="font-bold mb-2 flex items-center gap-2"><FileText size={16}/> ملاحظات</h3>
                        <p className="text-gray-700">العملية موثّقة بالكامل وتم إصدار هذا الإشعار تلقائيًا من نظامنا. نسخة من التفاصيل محفوظة في حساب العميل للمراجعة.</p>
                    </div>
                     <div className="border rounded-lg p-4 bg-yellow-50 text-sm">
                        <h3 className="font-bold mb-2 flex items-center gap-2 text-yellow-800"><BrainCircuit size={16}/> نصيحة</h3>
                        <p className="text-yellow-900">بعد وصول المبلغ لمحفظتك، يصبح تحت مسؤوليتك الكاملة. لا تصدق أي وعود باستثمار مضمون أو مضاعفة الأرباح لتجنب الاحتيال.</p>
                    </div>
                 </div>

            </main>
            
            {/* Footer */}
            <footer className="text-center text-xs text-gray-500 mt-auto pt-4 border-t">
                <p>{formattedDate} - {formattedTime}</p>
            </footer>

        </div>
    );
});
Invoice.displayName = 'Invoice';
