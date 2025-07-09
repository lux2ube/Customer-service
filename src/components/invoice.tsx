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
                if (ten > 0) {
                     words.push('و' + tens[ten]);
                }
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
    
    const senderName = !isDeposit ? client.name : (transaction.notes || 'غير محدد');
    const receiverName = isDeposit ? client.name : (transaction.notes || 'غير محدد');

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US', {useGrouping: true}).format(value);
    }
    const getCurrencyName = (currencyCode: string) => {
        switch(currencyCode?.toUpperCase()) {
            case 'YER': return 'يمني';
            case 'SAR': return 'سعودي';
            case 'USD': return 'دولار';
            case 'USDT': return 'USDT';
            default: return currencyCode || '';
        }
    }
    
    const sourceName = transaction.bankAccountName || transaction.cryptoWalletName || "المركز الرئيسي";

    const formattedDate = format(new Date(transaction.date), 'yyyy-MM-dd');
    const formattedTime = format(new Date(transaction.date), 'hh:mm a');
    const docNumber = transaction.id.slice(-6).toUpperCase();

    const renderFinancialRow = (label: string, value: string, isMono = false) => (
        <div className="flex justify-between border-b last:border-b-0 border-gray-200 py-1.5 px-2 text-sm">
            <span className="font-semibold">{label}</span>
            <span className={cn(isMono && 'font-mono tracking-wider', "font-bold")}>{value}</span>
        </div>
    );

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
                    <div className="bg-[#ffaa00] text-[#0033CC] font-bold px-3 py-1 rounded-full text-xs flex items-center justify-center gap-2">
                         <Phone size={14} className="transform -scale-x-100"/>
                        <span>714254621 - 733465111 - 771195040</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="p-3 space-y-2">
                
                {/* Title Bar */}
                <div style={{ backgroundColor: '#0033CC' }} className="text-white p-2 rounded-lg flex justify-between items-center">
                    <div className="border border-white rounded-md px-3 py-1 text-center">
                        <p className="text-sm font-semibold">التاريخ : {formattedDate}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <h2 className="text-2xl font-bold">{title}</h2>
                    </div>
                    <div className="border border-white rounded-md px-3 py-1 text-center">
                        <p className="text-sm font-semibold">رقم المستند : {docNumber}</p>
                    </div>
                </div>

                {/* Client Info */}
                <div className="flex border-2 border-black rounded-lg p-1.5 items-center text-sm gap-2">
                    <div className="bg-[#0033CC] text-white font-bold px-3 h-8 rounded flex items-center justify-center">عميلنا</div>
                    <span className="flex-1 px-2 text-center font-semibold text-base">{client.name}</span>
                    <div className="bg-[#0033CC] text-white font-bold px-3 h-8 rounded flex items-center justify-center">رقم الحساب</div>
                    <span className="px-4 font-mono text-base">{transaction.bankAccountId || transaction.cryptoWalletId || 'N/A'}</span>
                </div>

                {/* Notification message */}
                <div className="border-2 border-black rounded-lg p-2 text-center text-sm font-semibold">
                    نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية
                </div>

                {/* Financial details */}
                <div className="border-2 border-black rounded-lg p-2">
                    {renderFinancialRow("العملة:", getCurrencyName(transaction.currency))}
                    {renderFinancialRow("المبلغ:", `${formatCurrency(transaction.amount)}`, true)}
                    {renderFinancialRow("المبلغ بالدولار:", `$${formatCurrency(transaction.amount_usd)}`, true)}
                    {transaction.fee_usd > 0 && renderFinancialRow("الرسوم بالدولار:", `$${formatCurrency(transaction.fee_usd)}`, true)}
                    {transaction.expense_usd && transaction.expense_usd > 0 && renderFinancialRow("مصروفات بالدولار:", `$${formatCurrency(transaction.expense_usd)}`, true)}
                    {renderFinancialRow("المبلغ النهائي USDT:", `${formatCurrency(transaction.amount_usdt)}`, true)}
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
                         <div className="flex justify-between"><span>المصدر:</span> <span className="font-semibold">{sourceName}</span></div>
                        <div className="flex justify-between"><span>المستلم:</span> <span className="font-semibold">{receiverName}</span></div>
                        <div className="flex justify-between"><span>المرسل:</span> <span className="font-semibold">{senderName}</span></div>
                         <div className="col-span-2 flex justify-between items-center">
                            <span>Hash:</span> 
                            <span className="font-mono text-xs break-all text-left flex-1 ml-2" dir="ltr">{transaction.hash || 'N/A'}</span>
                        </div>
                        <div className="col-span-2 flex justify-between items-center">
                            <span>Client Wallet:</span> 
                            <span className="font-mono text-xs break-all text-left flex-1 ml-2" dir="ltr">{transaction.client_wallet_address || 'N/A'}</span>
                        </div>
                    </div>
                </div>
            </main>
            
            {/* Footer */}
            <footer className="p-3 grid grid-cols-3 items-center text-xs">
                 <div className="text-left">
                    <div className="bg-[#0033CC] text-white font-semibold px-4 py-1.5 rounded-lg text-sm flex items-center justify-center">
                        {formattedTime} {formattedDate}
                    </div>
                 </div>
                 <div className="text-center">
                    <div className="bg-[#0033CC] text-white font-semibold px-4 py-1.5 rounded-lg text-sm flex items-center justify-center">
                        هذا الإشعار آلي ولا يحتاج ختم أو توقيع
                    </div>
                 </div>
                 <div />
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
