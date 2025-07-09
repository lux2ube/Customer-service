
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { User, Wallet, Hash, CheckCircle, BrainCircuit, FileText, Landmark, Banknote, Calendar, Phone } from 'lucide-react';
import { ar } from 'date-fns/locale';

// --- TAFQEET FUNCTION (Number to Arabic Words) ---
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
    if (num === null || num === undefined) return '';
    const number = Math.floor(num);
    if (number === 0) return 'صفر';

    const currencies = {
        YER: { single: 'ريال يمني', plural: 'ريالاً يمنياً' },
        SAR: { single: 'ريال سعودي', plural: 'ريالاً سعودياً' },
        USD: { single: 'دولار أمريكي', plural: 'دولاراً أمريكياً' },
        USDT: { single: 'USDT', plural: 'USDT' }
    };
    const selectedCurrency = currencies[currency as keyof typeof currencies] || { single: currency, plural: currency };
    
    let words = [];
    
    const millions = Math.floor(number / 1_000_000);
    if (millions > 0) {
        words.push(convertThousands(millions) + ' مليون');
    }
    
    const thousands = Math.floor((number % 1_000_000) / 1000);
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
    
    const joinedWords = words.join(' و');
    if (!joinedWords) return '';

    return `فقط ${joinedWords} ${selectedCurrency.plural} لا غير.`;
}
// --- END TAFQEET ---

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const transactionDate = new Date(transaction.date);
    const hijriDate = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {day: 'numeric', month: 'long', year: 'numeric'}).format(transactionDate);

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-white shadow-lg font-cairo border-2 border-gray-300 mx-auto flex flex-col p-4">

            {/* Header */}
            <header className="flex justify-between items-center pb-3 border-b-4 border-blue-800 bg-blue-700 text-white p-3">
                <div className="text-right">
                    <h2 className="text-2xl font-bold">كوين كاش للدفع الإلكتروني</h2>
                    <p className="text-sm mt-1">صنعاء - شارع الخمسين</p>
                </div>
                <div className="text-left">
                     <CoinCashLogo className="w-24 h-24" />
                </div>
            </header>
            
            {/* Title and Meta Info */}
            <section className="my-5 px-2">
                <h1 className="text-center text-3xl font-bold border-b-2 border-blue-800 pb-2 mb-4 text-blue-900">
                    {isDeposit ? 'سند قبض' : 'سند صرف'}
                </h1>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold">التاريخ الميلادي:</span>
                        <span>{format(transactionDate, "yyyy / MM / dd")}</span>
                    </div>
                     <div className="flex items-center justify-start gap-2">
                        <span className="font-semibold">التاريخ الهجري:</span>
                        <span>{hijriDate}</span>
                    </div>
                </div>
            </section>
            
            {/* Main Content */}
            <main className="flex-grow space-y-4 border-2 border-blue-100 rounded-lg p-4 bg-gray-50/50">
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                    <span className="font-bold text-lg">استلمنا من المكرم:</span>
                    <span className="border-b-2 border-dotted border-gray-400 py-1 text-lg font-semibold text-blue-800">{client.name}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                    <span className="font-bold text-lg">مبلغاً وقدره:</span>
                    <span className="border-b-2 border-dotted border-gray-400 py-1">{tafqeet(transaction.amount, transaction.currency)}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr_auto_1fr] items-center gap-x-3">
                    <span className="font-bold text-lg">نقداً / بشيك رقم:</span>
                    <span className="border-b-2 border-dotted border-gray-400 py-1 font-semibold">{transaction.remittance_number || 'نقد'}</span>
                     <span className="font-bold text-lg">على بنك:</span>
                    <span className="border-b-2 border-dotted border-gray-400 py-1 font-semibold">{transaction.bankAccountName || 'غير محدد'}</span>
                </div>
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                    <span className="font-bold text-lg">وذلك مقابل:</span>
                    <div className="border-b-2 border-dotted border-gray-400 py-1 font-semibold">
                         {isDeposit 
                            ? `إيداع مبلغ ${transaction.amount_usdt.toFixed(2)} USDT إلى محفظة العميل`
                            : `سحب مبلغ ${transaction.amount_usdt.toFixed(2)} USDT من محفظة العميل`}
                         <p className="font-mono text-xs text-left break-all text-gray-600" dir="ltr">{transaction.client_wallet_address}</p>
                         <p className="font-mono text-xs text-left break-all text-gray-500 mt-1" dir="ltr">Hash: {transaction.hash}</p>
                    </div>
                </div>

                <div className="flex justify-center items-center h-24 mt-4 text-center border-4 border-blue-800 bg-white rounded-lg">
                    <span className="font-bold text-2xl text-blue-900 px-2">{transaction.currency}</span>
                    <span className="font-mono text-4xl font-black text-blue-900 bg-blue-100 px-4 py-2 rounded-md">
                         {new Intl.NumberFormat('en-US').format(transaction.amount)}
                    </span>
                </div>
            </main>

            {/* Signatures */}
            <section className="mt-auto pt-8 flex justify-around text-center">
                 <div>
                    <h4 className="font-bold">توقيع المستلم</h4>
                    <p className="border-b-2 border-dotted border-gray-400 mt-8 w-48">&nbsp;</p>
                </div>
                <div>
                    <h4 className="font-bold">توقيع المحاسب</h4>
                    <p className="border-b-2 border-dotted border-gray-400 mt-8 w-48">&nbsp;</p>
                </div>
                 <div>
                    <h4 className="font-bold">توقيع المدير</h4>
                    <p className="border-b-2 border-dotted border-gray-400 mt-8 w-48">&nbsp;</p>
                </div>
            </section>
            
            {/* Footer */}
            <footer className="text-center text-xs text-white mt-4 p-2 bg-blue-700 border-t-4 border-blue-800 rounded-b-md">
                <p>للتواصل: 739032432 - 779331117</p>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
