
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { IbnJaberLogo } from "./ibn-jaber-logo";
import { cn } from "@/lib/utils";


// --- Arabic Translation and Formatting Helpers ---

const toArabicWords = (num: number): string => {
    if (num === 0) return 'صفر';
    const integer = Math.floor(num);
    if (integer === 0) return '';


    const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
    const teens = ['عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const hundreds = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
    
    let words = [];
    
    if (integer >= 1000000) {
        words.push(toArabicWords(Math.floor(integer / 1000000)) + ' مليون');
        num %= 1000000;
    }
    
    if (integer >= 1000) {
        const thousands = Math.floor(integer / 1000);
        if (thousands === 1) words.push('ألف');
        else if (thousands === 2) words.push('ألفان');
        else if (thousands > 2 && thousands < 11) words.push(toArabicWords(thousands) + ' آلاف');
        else words.push(toArabicWords(thousands) + ' ألف');
        num %= 1000;
    }

    if (integer >= 100) {
        words.push(hundreds[Math.floor(integer / 100)]);
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
                words.push(units[unit] + ' و' + tens[ten]);
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
            mainCurrency = 'دولار أمريكي';
            break;
        default:
            mainCurrency = currency;
    }

    const integerPart = Math.floor(value);
    const amountInWords = toArabicWords(integerPart);

    return `فقط ${amountInWords || 'صفر'} ${mainCurrency} لا غير.`;
};


const DetailRow = ({ label, value }: { label: string, value?: string | number | null }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex items-start justify-between border-b border-gray-200 py-2">
            <dt className="text-sm font-medium text-gray-500">{label}</dt>
            <dd className="text-sm font-semibold text-gray-900 text-left">{String(value)}</dd>
        </div>
    );
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const title = isDeposit ? 'إشعار قيد' : 'إشعار خصم';
    const senderName = isDeposit ? 'غير محدد' : client.name;
    const receiverName = isDeposit ? client.name : 'غير محدد';

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US', {useGrouping: true}).format(value);
    }
    const getCurrencyName = (currencyCode: string) => {
        switch(currencyCode.toUpperCase()) {
            case 'YER': return 'يمني';
            case 'SAR': return 'سعودي';
            case 'USD': return 'أمريكي';
            case 'USDT': return 'USDT';
            default: return currencyCode;
        }
    }

    return (
        <div ref={ref} dir="rtl" className="bg-gray-100 dark:bg-gray-900 p-4 font-cairo">
            <div className="w-full max-w-3xl mx-auto bg-white shadow-lg rounded-xl overflow-hidden border border-gray-300">
                
                {/* Header */}
                <header style={{ backgroundColor: '#0033cc' }} className="text-white p-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <IbnJaberLogo />
                        <div>
                            <h1 className="text-xl font-bold">ابن جابر اكسبرس</h1>
                            <p className="text-sm">للصرافة والحوالات</p>
                        </div>
                    </div>
                    <div className="text-left">
                        <p className="text-sm">ذمار - الجبوب - الشارع العام</p>
                        <div style={{ backgroundColor: '#ffaa00' }} className="text-blue-900 font-bold p-1 rounded-md mt-1 text-center text-xs space-y-0.5">
                            <p>778284271</p>
                            <p>730599923</p>
                            <p>06-433804</p>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="p-4 space-y-4 text-base">
                    
                    {/* Title Bar */}
                    <div style={{ backgroundColor: '#0033cc' }} className="text-white p-2 rounded-md flex justify-between items-center text-center">
                        <div className="border-2 border-red-400 rounded-md px-2 py-1">
                            <p className="text-xs opacity-80">التاريخ</p>
                            <p className="font-semibold text-sm">{format(new Date(transaction.date), 'dd-MM-yyyy')}</p>
                        </div>
                        <h2 className="text-xl font-bold">{title}</h2>
                        <div className="border-2 border-red-400 rounded-md px-2 py-1">
                            <p className="text-xs opacity-80">رقم المستند</p>
                            <p className="font-semibold text-sm">{transaction.id.slice(-6).toUpperCase()}</p>
                        </div>
                    </div>

                    {/* Client & Amount Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <section className="border border-gray-300 rounded-lg p-3">
                           <DetailRow label="اسم العميل" value={client.name} />
                           <DetailRow label="رقم الحساب" value={transaction.bankAccountId} />
                        </section>
                        <section className="border border-gray-300 rounded-lg p-3">
                            <DetailRow label="عملة الحساب" value={getCurrencyName(transaction.currency)} />
                            <DetailRow label="المبلغ" value={formatCurrency(transaction.amount)} />
                            <div className="pt-2">
                                <p className="text-sm font-medium text-gray-500">المبلغ كتابةً:</p>
                                <p className="font-semibold text-blue-800 text-sm mt-1 text-center">{tafqeet(transaction.amount, transaction.currency)}</p>
                            </div>
                        </section>
                    </div>

                    {/* Transaction Details */}
                    <section className="border border-gray-300 rounded-lg p-3">
                         <h3 className="text-lg font-bold mb-2 pb-2 border-b text-center text-gray-700">تفاصيل العملية</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                            <dl>
                               <DetailRow label="المصدر" value="شبكة أميري كاش" />
                               <DetailRow label="المرسل" value={senderName} />
                               <DetailRow label="المستلم" value={receiverName} />
                            </dl>
                            <dl>
                               <DetailRow label="رقم الحوالة" value={transaction.remittance_number} />
                               <DetailRow label="مرجع الصرافة" value={transaction.remittance_number} />
                            </dl>
                         </div>
                    </section>
                </main>

                {/* Footer */}
                <footer className="p-3 border-t border-gray-200 flex justify-between items-center text-xs">
                    <p className="text-gray-500">{format(new Date(transaction.date), 'dd-MM-yyyy, hh:mm a')}</p>
                    <div style={{ backgroundColor: '#0033cc' }} className="text-white font-semibold px-3 py-1 rounded-full">
                        هذا الإشعار آلي ولا يتطلب ختم أو توقيع
                    </div>
                </footer>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
