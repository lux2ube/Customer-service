
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
    
    const senderName = !isDeposit ? (transaction.client_wallet_address || 'غير محدد') : client.name;
    const receiverName = isDeposit ? (transaction.client_wallet_address || 'غير محدد') : client.name;

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
                     <div className="flex items-center justify-center gap-2">
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
            <main className="p-3 space-y-4">
                
                {/* Title Bar */}
                <div style={{ backgroundColor: '#0033CC' }} className="text-white p-2 rounded-lg flex justify-between items-center">
                    <div className="border border-white rounded-md px-3 py-1 text-center flex items-center justify-center">
                        <p className="text-sm font-semibold">التاريخ : {formattedDate}</p>
                    </div>
                    <div className="flex-1 text-center flex items-center justify-center">
                      <h2 className="text-2xl font-bold">{title}</h2>
                    </div>
                    <div className="border border-white rounded-md px-3 py-1 text-center flex items-center justify-center">
                        <p className="text-sm font-semibold">رقم المستند : {docNumber}</p>
                    </div>
                </div>

                {/* Client Info */}
                <div className="flex border-2 border-black rounded-lg p-1.5 items-stretch text-sm gap-2">
                    <div className="bg-[#0033CC] text-white font-bold px-3 h-auto rounded flex items-center justify-center">عميلنا</div>
                    <span className="flex-1 px-2 text-center font-semibold text-base self-center">{client.name}</span>
                    <div className="bg-[#0033CC] text-white font-bold px-3 h-auto rounded flex items-center justify-center">رقم الحساب</div>
                    <span className="px-4 font-mono text-base self-center">{transaction.bankAccountId || transaction.cryptoWalletId || 'N/A'}</span>
                </div>

                {/* What you Sent / Received */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                    {/* What Client Sent */}
                    <div className="border-2 border-black rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px]">
                        <h3 className="font-bold text-base underline mb-2">ما أرسلته</h3>
                        <div className="text-center">
                            <p className="font-mono font-bold text-2xl text-gray-700 tracking-wider">
                                {isDeposit ? 
                                    `${formatCurrency(transaction.amount)} ${getCurrencyName(transaction.currency)}` :
                                    (
                                        <>
                                            <span className="text-gray-500">USDT </span>
                                            <span>{formatCurrency(transaction.amount_usdt)}</span>
                                        </>
                                    )
                                }
                            </p>
                            {isDeposit && (
                                <p className="text-xs text-muted-foreground font-mono mt-1">
                                    (يعادل ${formatCurrency(transaction.amount_usd)})
                                </p>
                            )}
                        </div>
                    </div>

                    {/* What Client Received */}
                    <div className="border-2 border-black rounded-lg p-2 flex flex-col items-center justify-center min-h-[120px]">
                        <h3 className="font-bold text-base underline mb-2">ما استلمته</h3>
                        <div className="text-center">
                            <p className="font-mono font-bold text-2xl tracking-wider">
                                {isDeposit ?
                                    (
                                        <>
                                            <span className="text-gray-500">USDT </span>
                                            <span className="text-green-600">{formatCurrency(transaction.amount_usdt)}</span>
                                        </>
                                    ) :
                                    <span className="text-green-600">{`${formatCurrency(transaction.amount)} ${getCurrencyName(transaction.currency)}`}</span>
                                }
                            </p>
                            {!isDeposit && (
                                <p className="text-xs text-muted-foreground font-mono mt-1">
                                    (يعادل ${formatCurrency(transaction.amount_usd)})
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                
                 {/* Fee and Expense Details */}
                {(transaction.fee_usd > 0 || (transaction.expense_usd && transaction.expense_usd > 0)) && (
                    <div className="border-2 border-black rounded-lg p-1.5 text-xs text-center font-semibold">
                        <span>تفاصيل العملية: </span>
                        {transaction.fee_usd > 0 && <span>العمولة ${formatCurrency(transaction.fee_usd)}</span>}
                        {(transaction.fee_usd > 0 && transaction.expense_usd && transaction.expense_usd > 0) && <span className="mx-2">|</span>}
                        {(transaction.expense_usd && transaction.expense_usd > 0) && <span>مصروفات ${formatCurrency(transaction.expense_usd)}</span>}
                    </div>
                )}

                {/* Amount in words */}
                <div className="border-2 border-black rounded-lg p-2 text-center text-sm font-bold">
                    {tafqeet(transaction.amount, transaction.currency)}
                </div>

                {/* البيان section */}
                <div className="border-2 border-black rounded-lg p-2">
                    <div className="text-center font-bold text-sm underline mb-2">البيان</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm px-4">
                        <div className="col-span-2 flex justify-between items-center">
                            <span className="font-semibold">Hash:</span>
                            <span className="font-mono text-xs break-all text-left flex-1 ml-2" dir="ltr">{transaction.hash || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">المصدر:</span>
                            <span className="font-medium">{sourceName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">المستلم:</span>
                            <span className="font-medium break-all">{receiverName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="font-semibold">المرسل:</span>
                            <span className="font-medium break-all">{senderName}</span>
                        </div>
                    </div>
                </div>
            </main>
            
            {/* Footer */}
            <footer className="p-3 grid grid-cols-3 items-center text-xs">
                 <div className="text-left">
                    <div className="bg-[#0033CC] text-white font-semibold px-3 py-1.5 rounded-lg text-sm flex items-center justify-center">
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


