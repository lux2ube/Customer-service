
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { IbnJaberLogo } from "./ibn-jaber-logo";

const InfoCell = ({ label, value, className, fullWidth = false, labelClassName, valueClassName }: { label?: string, value?: string | number | null, className?: string, fullWidth?: boolean, labelClassName?: string, valueClassName?: string }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className={cn("border border-black rounded-lg p-2 text-center", fullWidth && "col-span-2", className)}>
            {label && <p className={cn("text-sm font-semibold mb-1", labelClassName)}>{label}</p>}
            <p className={cn("font-bold", valueClassName)}>{value}</p>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const formattedDate = format(transactionDate, "yyyy-MM-dd");
    const formattedTime = format(transactionDate, "p");

    const amountInWords = `(${transaction.amount_usd} USD equivalent)`; // Placeholder for amount in words

    return (
        <div ref={ref} className="w-full max-w-4xl mx-auto bg-white text-black font-cairo p-4" dir="rtl">
            <div className="border-4 border-blue-800 p-2">
                <header className="relative bg-blue-800 text-white p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold">أبن جابراكسبرس</h1>
                            <p className="text-sm">للصرافة والتحويلات</p>
                        </div>
                        <IbnJaberLogo className="w-24 h-auto" />
                    </div>
                    <div className="absolute -bottom-4 left-0 right-0 px-4">
                        <div className="bg-yellow-500 text-black text-xs font-bold p-2 rounded-full text-center tracking-wider">
                           714254621 - 733465111 - 771195040
                        </div>
                    </div>
                </header>

                <main className="mt-8 space-y-3">
                    <div className="relative text-center my-4">
                        <h2 className="inline-block bg-blue-800 text-white font-bold text-2xl px-12 py-2 rounded-lg">
                            سند إشعار {transaction.type === 'Deposit' ? 'دائن' : 'مدين'}
                        </h2>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                        <div></div>
                        <InfoCell label="رقم المستند" value={transaction.id.slice(-6).toUpperCase()} className="!border-blue-800 !border-2" />
                        <InfoCell label="التاريخ" value={formattedDate} className="!border-blue-800 !border-2" />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                       <InfoCell label="عميلنا" value={client?.name || transaction.clientName} className="col-span-2" />
                       <InfoCell label="رقم الحساب" value={transaction.clientId.slice(0, 10)} />
                    </div>

                    <InfoCell value="نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية" fullWidth />

                    <div className="grid grid-cols-2 gap-2 text-sm">
                       <InfoCell label="مبلغ الحساب" value={transaction.amount.toLocaleString()} />
                       <InfoCell label="عملة الحساب" value={transaction.currency} />
                    </div>
                    
                    <InfoCell value={amountInWords} fullWidth />

                    <div className="space-y-2 pt-2">
                        <h3 className="text-center font-bold bg-gray-200 p-1 rounded-md">البيان</h3>
                        <div className="border border-black rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="font-semibold">رقم الحوالة:</span>
                                <span>{transaction.remittance_number || 'N/A'}</span>
                            </div>
                             <div className="flex justify-between">
                                <span className="font-semibold">المستلم:</span>
                                <span>{client?.name || transaction.clientName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">المصدر:</span>
                                <span>{transaction.bankAccountName || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-semibold">المرسل:</span>
                                <span>{transaction.notes || 'N/A'}</span>
                            </div>
                            {transaction.hash && (
                                <div className="flex justify-between">
                                    <span className="font-semibold">معرف العملية:</span>
                                    <span className="font-mono text-xs break-all">{transaction.hash}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <footer className="flex justify-between items-center mt-6 text-xs">
                     <div className="bg-blue-800 text-white p-2 rounded-lg">
                        {formattedDate} {formattedTime}
                    </div>
                    <div className="bg-blue-800 text-white p-2 rounded-lg font-semibold">
                        هذا الإشعار آلي ولا يحتاج ختم أو توقيع
                    </div>
                </footer>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
