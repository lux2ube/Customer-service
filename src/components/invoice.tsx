
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { Building, Hash, Landmark, User, Wallet, Phone, MapPin, ArrowLeftRight, CheckCircle, FileText } from 'lucide-react';

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
    
    const renderSenderReceiver = () => {
        const sender = {
            title: "المرسل",
            name: isDeposit ? client.name : (transaction.client_wallet_address || 'محفظة العميل'),
            accountLabel: isDeposit ? 'من حساب بنكي' : 'من محفظة رقمية',
            accountValue: isDeposit ? transaction.bankAccountName : transaction.client_wallet_address,
            amount: isDeposit ? transaction.amount : transaction.amount_usdt,
            currency: isDeposit ? transaction.currency : 'USDT',
            icon: isDeposit ? <Landmark className="h-8 w-8 text-primary" /> : <Wallet className="h-8 w-8 text-primary" />
        };

        const receiver = {
            title: "المستلم",
            name: isDeposit ? (transaction.client_wallet_address || 'محفظة العميل') : client.name,
            accountLabel: isDeposit ? 'إلى محفظة رقمية' : 'إلى حساب بنكي',
            accountValue: isDeposit ? transaction.client_wallet_address : transaction.bankAccountName,
            amount: isDeposit ? transaction.amount_usdt : transaction.amount,
            currency: isDeposit ? 'USDT' : transaction.currency,
            icon: isDeposit ? <Wallet className="h-8 w-8 text-green-600" /> : <Landmark className="h-8 w-8 text-green-600" />
        };
        
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-gray-50 p-4 rounded-lg border">
                {/* Sender Details */}
                <div className="space-y-2 text-center">
                    <div className="flex justify-center items-center gap-2 font-bold text-lg text-primary">{sender.icon} {sender.title}</div>
                    <p className="font-semibold text-base">{sender.name}</p>
                    <p className="text-sm text-gray-600 break-all">{sender.accountLabel}: <span className="font-mono">{sender.accountValue}</span></p>
                    <p className="text-xl font-bold font-mono text-gray-800">{formatNumber(sender.amount)} <span className="text-sm">{sender.currency}</span></p>
                </div>

                {/* Receiver Details */}
                <div className="space-y-2 text-center">
                    <div className="flex justify-center items-center gap-2 font-bold text-lg text-green-600">{receiver.icon} {receiver.title}</div>
                    <p className="font-semibold text-base">{receiver.name}</p>
                    <p className="text-sm text-gray-600 break-all">{receiver.accountLabel}: <span className="font-mono">{receiver.accountValue}</span></p>
                    <p className="text-xl font-bold font-mono text-green-700">{formatNumber(receiver.amount)} <span className="text-sm">{receiver.currency}</span></p>
                </div>
            </div>
        );
    };

    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-white shadow-xl font-cairo border-2 border-gray-200 mx-auto p-6 flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center pb-4 border-b-2 border-primary">
                <div className="text-right">
                    <h2 className="text-xl font-bold text-primary">كوين كاش للدفع الإلكتروني</h2>
                    <div className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                        <MapPin size={14} /> صنعاء - شارع الخمسين
                    </div>
                </div>
                <div className="text-left">
                     <CoinCashLogo className="w-20 h-20" />
                     <div className="text-sm text-gray-600 mt-1 flex items-center gap-2 justify-end">
                        <Phone size={14} /> 739032432 - 779331117
                    </div>
                </div>
            </header>

            {/* Title */}
            <section className="text-center my-4">
                <h1 className="text-2xl font-bold bg-primary text-primary-foreground py-2 px-4 rounded-lg inline-block">
                    إشعار معاملة {isDeposit ? 'إيداع' : 'سحب'}
                </h1>
                <div className="text-xs text-gray-500 mt-2">
                    {formattedDate} | {transaction.id}
                </div>
            </section>
            
            {/* Client Info */}
            <section className="grid grid-cols-2 gap-4 text-sm mb-6">
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
                    <User className="h-5 w-5 text-primary" />
                    <span className="font-semibold">العميل:</span>
                    <span>{client.name}</span>
                </div>
                <div className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
                     <FileText className="h-5 w-5 text-primary" />
                    <span className="font-semibold">رقم الحساب:</span>
                    <span className="font-mono">{client.id}</span>
                </div>
            </section>
            
            <main className="flex-grow space-y-6">
                {/* Transaction Flow */}
                {renderSenderReceiver()}

                {/* Financial Summary */}
                 <div className="border rounded-lg p-4">
                     <h3 className="font-bold mb-2">ملخص المعاملة:</h3>
                     <p className="text-center text-gray-700 bg-yellow-50 p-2 rounded-md">
                        {tafqeet(transaction.amount, transaction.currency)}
                     </p>
                    <table className="w-full text-sm mt-3">
                        <tbody>
                            <tr className="border-b">
                                <td className="p-2 font-semibold">المبلغ بالدولار الأمريكي:</td>
                                <td className="p-2 text-left font-mono">{formatNumber(transaction.amount_usd)} USD</td>
                            </tr>
                            <tr className="border-b">
                                <td className="p-2 font-semibold">الرسوم / الأرباح:</td>
                                <td className="p-2 text-left font-mono">{formatNumber(transaction.fee_usd)} USD</td>
                            </tr>
                            {(transaction.expense_usd || 0) > 0 && (
                                <tr className="border-b">
                                    <td className="p-2 font-semibold">مصاريف / خسائر:</td>
                                    <td className="p-2 text-left font-mono text-red-600">{formatNumber(transaction.expense_usd)} USD</td>
                                </tr>
                            )}
                             <tr className="bg-green-50">
                                <td className="p-2 font-bold text-base">المبلغ النهائي المستلم:</td>
                                <td className="p-2 text-left font-mono font-bold text-base text-green-700">{formatNumber(transaction.amount_usdt)} USDT</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Additional Details */}
                 <div className="border rounded-lg p-4 text-sm">
                    <h3 className="font-bold mb-3 flex items-center gap-2"><Hash size={16}/> تفاصيل إضافية:</h3>
                     <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <div className="font-semibold">رقم الحوالة (HASH):</div>
                        <div className="font-mono text-left break-all text-gray-600">{transaction.hash || 'N/A'}</div>

                        <div className="font-semibold">حالة العملية:</div>
                        <div className="text-left"><span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">{transaction.status}</span></div>

                        <div className="font-semibold">ملاحظات:</div>
                        <div className="text-left text-gray-600">{transaction.notes || 'لا يوجد'}</div>
                     </div>
                </div>
            </main>
            
            {/* Footer */}
            <footer className="text-center text-xs text-gray-500 mt-auto pt-4 border-t">
                <div className="bg-blue-50 text-primary p-2 rounded-md">
                    هذا الإشعار صادر من النظام الآلي لـ "كوين كاش" ويعتبر سندًا رسميًا للمعاملة.
                </div>
                <p className="mt-2">{formattedDate} - {formattedTime}</p>
            </footer>

        </div>
    );
});
Invoice.displayName = 'Invoice';
