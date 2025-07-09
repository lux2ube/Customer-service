
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { IbnJaberLogo } from "./ibn-jaber-logo";
import { Phone, MapPin } from 'lucide-react';
import { cn } from "@/lib/utils";

// --- Arabic Translation and Formatting Helpers ---

const toArabicWords = (num: number): string => {
    num = Math.floor(num);
    if (num === 0) return 'صفر';

    const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
    const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    
    let words = [];
    
    if (num >= 1000000) {
        words.push(toArabicWords(Math.floor(num / 1000000)) + ' مليون');
        num %= 1000000;
    }
    
    if (num >= 1000) {
        const thousands = Math.floor(num / 1000);
        if (thousands === 1) words.push('ألف');
        else if (thousands === 2) words.push('ألفان');
        else if (thousands > 2 && thousands < 11) words.push(toArabicWords(thousands) + ' آلاف');
        else words.push(toArabicWords(thousands) + ' ألف');
        num %= 1000;
    }

    if (num >= 100) {
        words.push(hundreds[Math.floor(num / 100)]);
        num %= 100;
    }

    if (num > 0) {
        if (words.length > 0) words.push('و');
        if (num < 10) {
            words.push(units[num]);
        } else if (num < 20) {
            words.push(teens[num - 10]);
        } else {
            const unit = num % 10;
            const ten = Math.floor(num / 10);
            if (unit > 0) {
                words.push(units[unit]);
                words.push('و' + tens[ten]);
            } else {
                words.push(tens[ten]);
            }
        }
    }
    
    return words.join(' ');
};

const tafqeet = (value: number, currency: string) => {
    let mainCurrency = '';
    switch (currency.toUpperCase()) {
        case 'YER':
            mainCurrency = 'ريال يمني';
            break;
        case 'SAR':
            mainCurrency = 'ريال سعودي';
            break;
        case 'USD':
        case 'USDT':
            mainCurrency = 'دولار';
            break;
        default:
            mainCurrency = currency;
    }

    const integerPart = Math.floor(value);
    const amountInWords = toArabicWords(integerPart);

    return `فقط ${amountInWords || 'صفر'} ${mainCurrency} لا غير.`;
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const title = isDeposit ? 'سند إشعار دائن' : 'سند إشعار مدين';
    const senderName = isDeposit ? (transaction.notes || 'غير محدد') : client.name;
    const receiverName = isDeposit ? client.name : (transaction.notes || 'غير محدد');

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US', {useGrouping: true}).format(value);
    }
    const getCurrencyName = (currencyCode: string) => {
        switch(currencyCode.toUpperCase()) {
            case 'YER': return 'يمني';
            case 'SAR': return 'سعودي';
            case 'USD': return 'دولار';
            case 'USDT': return 'USDT';
            default: return currencyCode;
        }
    }

    const formattedDate = format(new Date(transaction.date), 'yyyy-MM-dd');
    const formattedTime = format(new Date(transaction.date), 'hh:mm a');
    const docNumber = transaction.id.slice(-6).toUpperCase();

    return (
        <div ref={ref} dir="rtl" className="w-[761px] bg-white shadow-lg font-cairo border-2 border-gray-300">
            {/* Header */}
            <header className="bg-[#0033CC] text-white p-3 flex justify-between items-center relative">
                <div className="flex items-center gap-4">
                    <IbnJaberLogo/>
                    <div className="pt-2">
                        <h1 className="text-2xl font-bold">ابن جابر اكسبرس</h1>
                        <p className="text-base">للصرافة والتحويلات</p>
                    </div>
                </div>
                <div className="text-left flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">دمت - الجبوب - الشارع العام</span>
                        <MapPin size={16}/>
                    </div>
                    <div className="bg-[#ffaa00] text-[#0033CC] font-bold px-3 py-1 rounded-full text-xs flex items-center gap-2">
                         <Phone size={14} className="transform -scale-x-100"/>
                        <span>714254621 - 733465111 - 771195040</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 space-y-2">
                
                {/* Title Bar */}
                <div style={{ backgroundColor: '#0033CC' }} className="text-white p-2 rounded-lg flex justify-between items-center text-center">
                    <div className="border border-white rounded-md px-3 py-1">
                        <p className="text-sm font-semibold">التاريخ : {formattedDate}</p>
                    </div>
                    <h2 className="text-2xl font-bold">{title}</h2>
                    <div className="border border-white rounded-md px-3 py-1">
                        <p className="text-sm font-semibold">رقم المستند : {docNumber}</p>
                    </div>
                </div>

                {/* Client Info */}
                <div className="flex border-2 border-black rounded-lg p-1.5 items-center text-sm gap-2">
                    <span className="bg-[#0033CC] text-white font-bold px-3 py-1 rounded">عميلنا</span>
                    <span className="flex-1 px-2 text-center font-semibold text-base">{client.name}</span>
                    <span className="bg-[#0033CC] text-white font-bold px-3 py-1 rounded">رقم الحساب</span>
                    <span className="px-4 font-mono text-base">{transaction.bankAccountId}</span>
                </div>

                {/* Notification message */}
                <div className="border-2 border-black rounded-lg p-2 text-center text-sm font-semibold">
                    نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية
                </div>

                {/* Amount details */}
                <div className="grid grid-cols-2 gap-2 text-center text-sm">
                    <div className="border-2 border-black rounded-lg overflow-hidden">
                        <div className="bg-gray-200 p-1 font-bold">عملة الحساب</div>
                        <div className="p-2 font-semibold text-base">{getCurrencyName(transaction.currency)}</div>
                    </div>
                    <div className="border-2 border-black rounded-lg overflow-hidden">
                        <div className="bg-gray-200 p-1 font-bold">مبلغ الحساب</div>
                        <div className="p-2 font-semibold font-mono text-base">{formatCurrency(transaction.amount)}</div>
                    </div>
                </div>

                {/* Amount in words */}
                <div className="border-2 border-black rounded-lg p-2 text-center text-sm font-bold">
                    {tafqeet(transaction.amount, transaction.currency)}
                </div>

                {/* البيان section */}
                <div className="border-2 border-black rounded-lg p-2">
                    <div className="text-center font-bold text-sm underline mb-2">البيان</div>
                    <div className="grid grid-cols-2 gap-x-4 text-sm px-4">
                        <div className="flex justify-between"><span>رقم الحوالة:</span> <span className="font-mono font-semibold">{transaction.remittance_number || 'N/A'}</span></div>
                        <div className="flex justify-between"><span>المصدر:</span> <span className="font-semibold">المركز الرئيسي</span></div>
                        <div className="flex justify-between"><span>المستلم:</span> <span className="font-semibold">{receiverName}</span></div>
                        <div className="flex justify-between"><span>المرسل:</span> <span className="font-semibold">{senderName}</span></div>
                    </div>
                </div>
            </main>
            
            {/* Footer */}
            <footer className="p-3 flex justify-between items-center text-xs">
                <div className="bg-[#0033CC] text-white font-semibold px-4 py-1.5 rounded-lg text-sm">
                    {formattedTime} {formattedDate}
                </div>
                <div className="bg-[#0033CC] text-white font-semibold px-4 py-1.5 rounded-lg text-sm">
                    هذا الإشعار آلي ولا يحتاج ختم أو توقيع
                </div>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
