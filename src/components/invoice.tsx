
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { JaibLogo } from "./jaib-logo";
import { Copy, Download, Share2, X } from "lucide-react";

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
        Deposit: 'تحويل مشترك',
        Withdraw: 'تحويل مشترك'
    };
    
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
                    <span className="text-2xl font-bold text-green-600">{transaction.amount}</span>
                    <span className="mx-2 text-lg font-semibold">{currencyMap[transaction.currency] || transaction.currency}</span>
                </section>

                <section className="space-y-4 text-sm">
                    <div className="flex justify-between items-center border-b pb-4">
                        <dt className="text-gray-500">رقم مرجع العملية</dt>
                        <dd className="font-mono flex items-center gap-2">
                            <span>{transaction.id.slice(-12)}</span>
                            <Copy className="h-4 w-4 text-gray-400" />
                        </dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-4">
                        <dt className="text-gray-500">العملية</dt>
                        <dd className="font-semibold">{typeMap[transaction.type]}</dd>
                    </div>
                    <div className="flex justify-between items-center border-b pb-4">
                        <dt className="text-gray-500">تاريخ العملية</dt>
                        <dd className="font-semibold font-mono">
                            {format(new Date(transaction.date), '(HH:mm) dd/MM/yyyy')}
                        </dd>
                    </div>

                    {transaction.type === 'Withdraw' && (
                        <div className="text-right pt-2">
                            <dt className="text-gray-500 mb-1">المستفيد:</dt>
                            <dd className="font-bold text-base">{client.name}</dd>
                            <dd className="font-mono text-gray-600">{client.phone}</dd>
                        </div>
                    )}
                     {transaction.type === 'Deposit' && (
                        <div className="text-right pt-2">
                            <dt className="text-gray-500 mb-1">المودع:</dt>
                            <dd className="font-bold text-base">{client.name}</dd>
                            <dd className="font-mono text-gray-600">{client.phone}</dd>
                        </div>
                    )}
                    
                     <div className="text-right pt-2">
                        <dt className="text-gray-500 mb-1">
                            {transaction.type === 'Withdraw' ? 'المودع:' : 'المستفيد:'}
                        </dt>
                        <dd className="font-bold text-base">Customer Central</dd>
                        <dd className="font-mono text-gray-600">Company Account</dd>
                    </div>
                </section>

                 <footer className="flex justify-around mt-8">
                    <div className="text-center">
                        <div className="bg-gray-100 rounded-xl p-4 mb-2 inline-block">
                             <Share2 className="h-6 w-6 text-gray-700" />
                        </div>
                        <p className="text-sm font-semibold">مشاركة</p>
                    </div>
                     <div className="text-center">
                        <div className="bg-gray-100 rounded-xl p-4 mb-2 inline-block">
                             <Download className="h-6 w-6 text-red-500" />
                        </div>
                        <p className="text-sm font-semibold">حفظ</p>
                    </div>
                 </footer>

            </div>
        </div>
    )
});
Invoice.displayName = 'Invoice';
