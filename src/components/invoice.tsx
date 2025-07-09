
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { IbnJaberLogo } from "./ibn-jaber-logo";
import { Phone, MapPin, Hash, User, Building, Landmark, Wallet } from 'lucide-react';
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
    
    // Deposit: Client sends local currency, gets USDT.
    // Withdraw: Client sends USDT, gets local currency.
    const senderName = isDeposit ? client.name : (transaction.client_wallet_address || 'N/A');
    const receiverName = isDeposit ? (transaction.client_wallet_address || 'N/A') : client.name;
    const sourceAccount = isDeposit ? transaction.bankAccountName : transaction.cryptoWalletName;

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
    
    const formattedDate = format(new Date(transaction.date), 'yyyy-MM-dd');
    const formattedTime = format(new Date(transaction.date), 'hh:mm a');
    const docNumber = transaction.id.slice(-6).toUpperCase();

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-white shadow-xl font-cairo border-2 border-gray-200 mx-auto p-8 text-gray-800 flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center pb-6 border-b-2 border-gray-200">
                <div className="flex items-center gap-4">
                    <IbnJaberLogo/>
                    <div>
                        <h1 className="text-2xl font-bold text-[#0033CC]">ابن جابر اكسبرس</h1>
                        <p className="text-sm text-gray-600">للصرافة والتحويلات</p>
                    </div>
                </div>
                <div className="text-left text-sm">
                    <p className="flex items-center justify-end gap-2"><MapPin size={14} /> دمت - الجبوب - الشارع العام</p>
                    <p className="flex items-center justify-end gap-2"><Phone size={14} /> 714254621 - 733465111</p>
                </div>
            </header>

            {/* Title & Meta Info */}
            <section className="mt-8 grid grid-cols-2 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-[#0033CC]">{title}</h2>
                    <p className="text-lg text-gray-500">{isDeposit ? 'Credit Voucher' : 'Debit Voucher'}</p>
                </div>
                <div className="text-left border-l-4 border-[#0033CC] pl-4">
                    <p><span className="font-bold">رقم المستند:</span> <span className="font-mono">{docNumber}</span></p>
                    <p><span className="font-bold">التاريخ:</span> <span className="font-mono">{formattedDate}</span></p>
                    <p><span className="font-bold">الوقت:</span> <span className="font-mono">{formattedTime}</span></p>
                </div>
            </section>

            {/* Billed to */}
            <section className="mt-8 rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-bold text-gray-500 mb-2">فاتورة إلى / Billed To</h3>
                <p className="text-lg font-bold">{client.name}</p>
                <p className="text-sm text-gray-600 font-mono">Client ID: {client.id}</p>
            </section>

            {/* Financial Table */}
            <section className="mt-8">
                <table className="w-full text-sm text-right border-collapse">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 font-bold text-gray-600 border">البيان / Description</th>
                            <th className="p-3 font-bold text-gray-600 text-left border">المبلغ / Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-b">
                            <td className="p-3 border">
                                {isDeposit ? `المبلغ المُرسل (${transaction.currency})` : `المبلغ المُرسل (USDT)`}
                            </td>
                            <td className="p-3 text-left font-mono text-lg border">
                                {isDeposit ? `${formatCurrency(transaction.amount)} ${getCurrencyName(transaction.currency)}` : `${formatCurrency(transaction.amount_usdt)} USDT`}
                            </td>
                        </tr>
                        <tr className="border-b bg-green-50">
                            <td className="p-3 font-bold border">
                                {isDeposit ? `المبلغ المستلم (USDT)` : `المبلغ المستلم (${transaction.currency})`}
                            </td>
                            <td className="p-3 text-left font-mono text-xl text-green-700 font-bold border">
                                {isDeposit ? `${formatCurrency(transaction.amount_usdt)} USDT` : `${formatCurrency(transaction.amount)} ${getCurrencyName(transaction.currency)}`}
                            </td>
                        </tr>
                        {((transaction.fee_usd ?? 0) > 0 || (transaction.expense_usd ?? 0) > 0) && (
                            <tr className="border-b text-xs text-gray-500">
                                <td className="p-3 border">الرسوم والمصاريف / Fees & Expenses (USD)</td>
                                <td className="p-3 text-left font-mono border">
                                    {(transaction.fee_usd ?? 0) > 0 && `Fee: $${formatCurrency(transaction.fee_usd)}`}
                                    {(transaction.expense_usd ?? 0) > 0 && ` Expense: $${formatCurrency(transaction.expense_usd)}`}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
            
            {/* Tafqeet */}
            <section className="mt-4 rounded-lg bg-gray-100 p-4 text-center">
                <p className="font-bold">{tafqeet(transaction.amount, transaction.currency)}</p>
            </section>

            {/* Transaction Details */}
            <section className="mt-8">
                <h3 className="text-lg font-bold text-[#0033CC] mb-4">تفاصيل العملية / Transaction Details</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm p-4 border rounded-lg">
                    <div className="col-span-2">
                        <p className="font-bold">المرسل / Sender</p>
                        <p className="text-gray-700 break-all">{senderName}</p>
                    </div>
                    <div className="col-span-2">
                        <p className="font-bold">المستلم / Receiver</p>
                        <p className="text-gray-700 break-all">{receiverName}</p>
                    </div>
                    <div>
                        <p className="font-bold">مصدر العملية / Source Account</p>
                        <p className="text-gray-700">{sourceAccount || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="font-bold">رقم الحوالة / Remittance No.</p>
                        <p className="text-gray-700 font-mono">{transaction.remittance_number || 'N/A'}</p>
                    </div>
                    <div className="col-span-2">
                        <p className="font-bold">Transaction Hash</p>
                        <p className="font-mono text-xs break-all text-left" dir="ltr">{transaction.hash || 'N/A'}</p>
                    </div>
                    {transaction.notes && (
                        <div className="col-span-2">
                            <p className="font-bold">ملاحظات / Notes</p>
                            <p className="text-gray-700">{transaction.notes}</p>
                        </div>
                    )}
                </div>
            </section>
            
            {/* Footer */}
            <footer className="mt-auto pt-8 text-center text-xs text-gray-500">
                <p className="bg-[#0033CC] text-white p-2 rounded-md inline-block">هذا الإشعار آلي ولا يحتاج ختم أو توقيع</p>
                <p className="mt-2">شكرًا لتعاملكم معنا</p>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';
