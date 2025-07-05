
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { JaibLogo } from "./jaib-logo";
import { Copy, X } from "lucide-react";

interface InvoiceProps {
    transaction: Transaction;
    client: Client;
}

export const Invoice = React.forwardRef<HTMLDivElement, InvoiceProps>(({ transaction, client }, ref) => {

    const currencyMap: Record<string, string> = {
        USD: 'دولار امريكي',
        YER: 'ريال يمني',
        SAR: 'ريال سعودي',
        USDT: 'USDT'
    };

    const typeMap: Record<string, string> = {
        Deposit: 'إيداع',
        Withdraw: 'سحب'
    };

    const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    
    return (
        <div ref={ref} className="bg-gray-800 p-4 font-sans" dir="rtl">
            <div className="bg-white rounded-2xl shadow-lg max-w-sm mx-auto p-6 text-gray-800">
                <header className="relative text-center mb-6">
                    <div className="absolute top-0 left-0">
                        <X className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="flex justify-center items-center gap-2 mb-2">
                        <JaibLogo className="h-10 w-auto" />
                    </div>
                    <h1 className="text-2xl font-bold">بيانات الحركة</h1>
                </header>

                <section className="bg-gray-100 rounded-lg p-3 text-center mb-6">
                    <span className="text-2xl font-bold text-green-600">{transaction.amount.toLocaleString()}</span>
                    <span className="mx-2 text-lg font-semibold">{currencyMap[transaction.currency] || transaction.currency}</span>
                </section>

                <section className="space-y-3 text-sm">
                    {/* --- Basic Info --- */}
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">رقم مرجع العملية</dt>
                        <dd className="font-mono flex items-center gap-2 text-xs">
                            <span>{transaction.id}</span>
                            <Copy className="h-4 w-4 text-gray-400 cursor-pointer" />
                        </dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">العملية</dt>
                        <dd className="font-semibold">{typeMap[transaction.type]}</dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">تاريخ العملية</dt>
                        <dd className="font-semibold font-mono">
                            {format(new Date(transaction.date), 'dd/MM/yyyy (HH:mm)')}
                        </dd>
                    </div>

                    {/* --- Financial Details --- */}
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">المبلغ بالدولار</dt>
                        <dd className="font-semibold font-mono">{formatUsd(transaction.amount_usd)}</dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">الرسوم</dt>
                        <dd className="font-semibold font-mono">{formatUsd(transaction.fee_usd)}</dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-3">
                        <dt className="text-gray-500">المبلغ النهائي USDT</dt>
                        <dd className="font-semibold font-mono">{transaction.amount_usdt.toFixed(2)}</dd>
                    </div>
                     
                    {/* --- Account & Wallet Info --- */}
                    {transaction.bankAccountName && (
                        <div className="flex justify-between items-center border-b pb-3">
                            <dt className="text-gray-500">{transaction.type === 'Deposit' ? 'حساب الإيداع' : 'حساب السحب'}</dt>
                            <dd className="font-semibold">{transaction.bankAccountName}</dd>
                        </div>
                    )}
                    {transaction.cryptoWalletName && (
                        <div className="flex justify-between items-center border-b pb-3">
                            <dt className="text-gray-500">المحفظة</dt>
                            <dd className="font-semibold">{transaction.cryptoWalletName}</dd>
                        </div>
                    )}
                    {transaction.client_wallet_address && (
                        <div className="flex justify-between items-center border-b pb-3 gap-2">
                            <dt className="text-gray-500 shrink-0">عنوان العميل</dt>
                            <dd className="font-mono text-xs break-all text-left" dir="ltr">{transaction.client_wallet_address}</dd>
                        </div>
                    )}
                    
                    {/* --- Party Details --- */}
                    <div className="text-right pt-2 border-b pb-3">
                        <dt className="text-gray-500 mb-1">
                            {transaction.type === 'Deposit' ? 'المودع:' : 'المستفيد:'}
                        </dt>
                        <dd className="font-bold text-base">{client.name}</dd>
                        <dd className="font-mono text-gray-600">{client.phone}</dd>
                    </div>
                     <div className="text-right pt-2">
                        <dt className="text-gray-500 mb-1">
                            {transaction.type === 'Deposit' ? 'المستفيد:' : 'المودع:'}
                        </dt>
                        <dd className="font-bold text-base">Customer Central</dd>
                        <dd className="font-mono text-gray-600">Company Account</dd>
                    </div>
                </section>
            </div>
        </div>
    )
});
Invoice.displayName = 'Invoice';
