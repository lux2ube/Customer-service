
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { IbnJaberLogo } from "./ibn-jaber-logo";

const InfoCell = ({ label, value, className, fullWidth = false, labelClassName, valueClassName }: { label?: string, value?: string | number | null, className?: string, fullWidth?: boolean, labelClassName?: string, valueClassName?: string }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className={cn("border border-gray-400 rounded-lg p-2 text-center flex flex-col justify-center", fullWidth && "col-span-2", className)}>
            {label && <p className={cn("text-xs text-gray-600", labelClassName)}>{label}</p>}
            <p className={cn("font-bold text-sm", valueClassName)}>{value}</p>
        </div>
    );
};


export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const formattedDate = format(transactionDate, "yyyy-MM-dd");

    const isDebit = transaction.type === 'Withdraw';
    const documentTitle = isDebit ? 'سند إشعار مدين' : 'سند إشعار دائن';

    const recipient = client?.name || transaction.clientName || 'N/A';
    const sourceAccount = transaction.bankAccountName || transaction.cryptoWalletName || 'N/A';

    return (
        <div ref={ref} className="w-[380px] bg-white text-black font-cairo p-1" dir="rtl">
            <div className="border-2 border-blue-800 p-1 rounded-lg space-y-2">
                {/* Header */}
                <header className="relative bg-blue-800 text-white p-2 pb-4 rounded-md overflow-hidden">
                    <div className="flex justify-between items-center">
                        <div className="text-right">
                            <h1 className="text-xl font-bold">أبن جابراكسبرس</h1>
                            <p className="text-xs">للصرافة والتحويلات</p>
                        </div>
                        <IbnJaberLogo className="w-16 h-auto" />
                    </div>
                    <div className="absolute -bottom-1 left-0 right-0 px-4">
                        <div className="bg-yellow-400 text-black text-[10px] font-bold p-1 rounded-full text-center tracking-tight shadow-md">
                           714254621 - 733465111 - 771195040
                        </div>
                    </div>
                </header>

                <main className="mt-4 space-y-2 px-1">
                    <div className="relative text-center my-2">
                        <h2 className="inline-block bg-blue-800 text-white font-bold text-base px-8 py-1 rounded-md shadow">
                            {documentTitle}
                        </h2>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                       <InfoCell label="التاريخ" value={formattedDate} />
                       <InfoCell label="رقم المستند" value={transaction.id.slice(-6).toUpperCase()} />
                       <InfoCell label="عميلنا" value={recipient} />
                       <InfoCell label="رقم الحساب" value={transaction.clientId.slice(0, 8)} />
                    </div>
                    
                    <InfoCell 
                        value="نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية" 
                        fullWidth 
                        className="text-sm font-semibold border-gray-400" 
                    />

                    <div className="grid grid-cols-2 gap-2 text-xs">
                       <InfoCell label="عملة الحساب" value={transaction.currency} />
                       <InfoCell label="مبلغ الحساب" value={transaction.amount.toLocaleString()} />
                    </div>
                    
                    <InfoCell 
                        value={`(USD equivalent ${transaction.amount_usd.toFixed(2)})`} 
                        fullWidth 
                        className="text-xs border-gray-400" 
                    />

                    <div className="space-y-1 pt-1">
                        <h3 className="text-center font-bold bg-gray-200 p-1 rounded-sm text-sm border border-gray-300">البيان</h3>
                        <div className="border border-gray-400 rounded-lg p-2 text-sm space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-600">رقم الحوالة:</span>
                                <span className="font-bold">{transaction.remittance_number || 'N/A'}</span>
                            </div>
                             <div className="flex justify-between">
                                <span className="text-gray-600">المستلم:</span>
                                <span className="font-bold">{recipient}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">المصدر:</span>
                                <span className="font-bold">{sourceAccount}</span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
