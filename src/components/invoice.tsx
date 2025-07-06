
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";

const BjLogo = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 100 50" className={cn("w-auto h-12", className)}>
        <defs>
            <pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse">
                <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke="#0033a0" strokeWidth="0.5" strokeOpacity="0.2"></path>
            </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#p)"></rect>
        <path d="M 12 8 C 4 8, 4 20, 12 20 L 70 20 C 85 20, 85 8, 70 8 Z" fill="#0033A0" />
        <path d="M 12 25 C 4 25, 4 37, 12 37 L 55 37 C 65 37, 65 25, 55 25 Z" fill="#f9b233" />
        <foreignObject x="4" y="8" width="80" height="20">
            <div className="flex items-center h-full text-white px-2 text-xs font-bold">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                <span className="ml-1">دمت - الجبوب - الشارع العام</span>
            </div>
        </foreignObject>
        <foreignObject x="4" y="25" width="80" height="14">
            <div className="flex items-center h-full text-white px-2 text-xs font-bold">
                 <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                 <span className="ml-1">714254621 - 733465111 - 771195040</span>
            </div>
        </foreignObject>
        <g transform="translate(70, -2)">
            <ellipse cx="15" cy="27" rx="14" ry="14" fill="#0033a0"/>
            <ellipse cx="15" cy="27" rx="12" ry="12" fill="white"/>
            <path d="M15,27 A12,12 0 0,1 25,18 L25,36 A12,12 0 0,1 15,27" fill="#0033a0" />
            <path d="M21,18 L29,18 L29,22 L21,22 Z" fill="#f9b233"/>
            <path d="M28,18 L34,12 L32,10 L26,16" stroke="#f9b233" strokeWidth="2" />
            <text x="8" y="32" fontFamily="Arial" fontSize="13" fontWeight="bold" fill="white">B</text>
            <text x="17" y="32" fontFamily="Arial" fontSize="13" fontWeight="bold" fill="white">J</text>
        </g>
    </svg>
);


const numberToWordsArabic = (num: number): string => {
    const integer = Math.floor(num);
    const units = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
    const teens = ["", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
    const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
    const hundreds = ["", "مائة", "مئتان", "ثلاثمائة", "أربعمائة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

    if (integer === 0) return "صفر";
    if (integer > 99999) return integer.toString();

    let words = '';
    
    const convertLessThanOneThousand = (n: number) => {
        let currentWords = '';
        if (n >= 100) {
            currentWords += hundreds[Math.floor(n / 100)];
            if (n % 100 !== 0) currentWords += ' و';
            n %= 100;
        }
        if (n >= 1 && n <= 10) {
            currentWords += units[n];
        } else if (n > 10 && n < 20) {
            currentWords += teens[n - 10];
        } else if (n >= 20) {
            const u = n % 10;
            const t = Math.floor(n / 10);
            if (u > 0) {
                currentWords += units[u] + ' و' + tens[t];
            } else {
                currentWords += tens[t];
            }
        }
        return currentWords;
    }
    
    if (integer >= 1000) {
        const thousandsPart = Math.floor(integer / 1000);
        if (thousandsPart === 1) words += 'ألف';
        else if (thousandsPart === 2) words += 'ألفان';
        else if (thousandsPart > 2 && thousandsPart < 11) words += convertLessThanOneThousand(thousandsPart) + ' آلاف';
        else words += convertLessThanOneThousand(thousandsPart) + ' ألف';

        const remainder = integer % 1000;
        if (remainder > 0) {
            words += ' و' + convertLessThanOneThousand(remainder);
        }
    } else {
        words = convertLessThanOneThousand(integer);
    }

    return words;
};

const mapCurrencyToArabic = (currency: string): string => {
    const map: Record<string, string> = {
        USD: 'دولار',
        YER: 'ريال يمني',
        SAR: 'ريال سعودي',
        USDT: 'USDT'
    };
    return map[currency] || currency;
}

interface InvoiceProps {
    transaction: Transaction;
    client: Client;
}

export const Invoice = React.forwardRef<HTMLDivElement, InvoiceProps>(({ transaction, client }, ref) => {
    
    const amountInWords = numberToWordsArabic(transaction.amount);
    const currencyInArabic = mapCurrencyToArabic(transaction.currency);
    const fullAmountInWords = `${amountInWords} ${currencyInArabic} لا غير`;
    const transactionDate = new Date(transaction.date);

    return (
        <div ref={ref} className="bg-white p-4 font-sans text-gray-800" dir="rtl">
            <div className="w-[480px] mx-auto bg-white border-2 border-gray-300 rounded-2xl shadow-lg p-3">
                
                <header className="relative mb-2">
                    <div className="flex justify-between items-center text-center">
                        <div className="text-blue-800 font-bold">
                             <h1 className="text-xl">أبن جابراكسبرس</h1>
                             <p className="text-sm">للصرافة والتحويلات</p>
                        </div>
                        <BjLogo />
                    </div>
                </header>

                <div className="relative flex justify-between items-center bg-blue-800 text-white font-bold p-2 rounded-lg text-sm mb-2">
                    <h1>سند إشعار دائن</h1>
                    <div className="flex items-center gap-4">
                        <p>رقم المستند: <span className="font-mono">{transaction.id.slice(-5).toUpperCase()}</span></p>
                        <p>التاريخ: <span className="font-mono">{format(transactionDate, 'yyyy-MM-dd')}</span></p>
                    </div>
                </div>

                <section className="space-y-1 text-sm">
                    <div className="flex border border-gray-400 rounded-lg">
                        <div className="bg-gray-200 p-2 rounded-r-md font-bold">عميلنا</div>
                        <div className="p-2 flex-grow font-semibold">{client.name}</div>
                        <div className="border-r border-gray-400 p-2 bg-gray-200 font-bold">رقم الحساب:</div>
                         <div className="p-2 font-mono">{client.phone}</div>
                    </div>
                    
                    <div className="text-center border border-gray-400 rounded-lg p-2 font-semibold">
                        نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية
                    </div>
                    
                    <div className="grid grid-cols-2 gap-1">
                        <div className="text-center border border-gray-400 rounded-lg p-2 font-bold bg-gray-200">مبلغ الحساب</div>
                        <div className="text-center border border-gray-400 rounded-lg p-2 font-bold bg-gray-200">عملة الحساب</div>
                        <div className="text-center border border-gray-400 rounded-lg p-2 font-mono font-bold">{transaction.amount.toLocaleString()}</div>
                        <div className="text-center border border-gray-400 rounded-lg p-2 font-bold">{currencyInArabic}</div>
                    </div>

                    <div className="text-center border border-gray-400 rounded-lg p-2 font-bold">
                        {fullAmountInWords}
                    </div>

                    <div className="flex border border-gray-400 rounded-lg">
                        <div className="bg-gray-200 p-2 rounded-r-md font-bold">البيان</div>
                        <div className="p-2 flex-grow grid grid-cols-2 gap-x-4">
                            <div><span className="font-semibold">رقم الحوالة:</span> <span className="font-mono">{transaction.remittance_number || 'N/A'}</span></div>
                            <div><span className="font-semibold">المصدر:</span> المركز الرئيسي</div>
                            <div><span className="font-semibold">المستلم:</span> {client.name}</div>
                            <div><span className="font-semibold">المرسل:</span> عبدالله عبدالقادر جعفر الحبشي</div>
                        </div>
                    </div>
                </section>
                
                <footer className="flex justify-between items-center mt-2 text-xs">
                    <div className="bg-blue-800 text-white rounded-lg p-1.5 px-3 font-mono">
                        {format(transactionDate, 'yyyy-MM-dd hh:mm a')}
                    </div>
                    <div className="bg-blue-800 text-white rounded-lg p-1.5 px-3 font-semibold">
                        هذا الإشعار آلي ولا يحتاج ختم أو توقيع
                    </div>
                </footer>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';

    