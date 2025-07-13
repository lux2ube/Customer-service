
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { IbnJaberLogo } from "./ibn-jaber-logo";

const InfoCell = ({ label, value, className, fullWidth = false, labelClassName, valueClassName }: { label?: string, value?: string | number | null, className?: string, fullWidth?: boolean, labelClassName?: string, valueClassName?: string }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className={cn("border border-black rounded-md p-1 text-center", fullWidth && "col-span-2", className)}>
            {label && <p className={cn("text-xs font-semibold", labelClassName)}>{label}</p>}
            <p className={cn("font-bold text-xs", valueClassName)}>{value}</p>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client | null }>(({ transaction, client }, ref) => {
    
    const transactionDate = new Date(transaction.date);
    const formattedDate = format(transactionDate, "yyyy-MM-dd");
    const formattedTime = format(transactionDate, "p");

    const amountInWords = `(${transaction.amount_usd} USD equivalent)`; // Placeholder for amount in words

    return (
        <div ref={ref} className="w-[380px] bg-white text-black font-cairo p-2" dir="rtl">
            <div className="border-2 border-blue-800 p-1">
                <header className="relative bg-blue-800 text-white p-2 rounded-md">
                    <div className="flex justify-between items-center">
                        <div className="flex-1">
                            <h1 className="text-xl font-bold">أبن جابراكسبرس</h1>
                            <p className="text-xs">للصرافة والتحويلات</p>
                        </div>
                        <IbnJaberLogo className="w-16 h-auto" />
                    </div>
                    <div className="absolute -bottom-3 left-0 right-0 px-2">
                        <div className="bg-yellow-500 text-black text-[8px] font-bold p-1 rounded-full text-center tracking-tight">
                           714254621 - 733465111 - 771195040
                        </div>
                    </div>
                </header>

                <main className="mt-4 space-y-1">
                    <div className="relative text-center my-2">
                        <h2 className="inline-block bg-blue-800 text-white font-bold text-lg px-8 py-1 rounded-md">
                            سند إشعار {transaction.type === 'Deposit' ? 'دائن' : 'مدين'}
                        </h2>
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-xs">
                        <div></div>
                        <InfoCell label="رقم المستند" value={transaction.id.slice(-6).toUpperCase()} className="!border-blue-800 !border" />
                        <InfoCell label="التاريخ" value={formattedDate} className="!border-blue-800 !border" />
                    </div>

                    <div className="grid grid-cols-3 gap-1 text-xs">
                       <InfoCell label="عميلنا" value={client?.name || transaction.clientName} className="col-span-2" />
                       <InfoCell label="رقم الحساب" value={transaction.clientId.slice(0, 10)} />
                    </div>

                    <InfoCell value="نود إشعاركم أننا قيدنا لحسابكم لدينا حسب التفاصيل التالية" fullWidth className="text-xs" />

                    <div className="grid grid-cols-2 gap-1 text-xs">
                       <InfoCell label="مبلغ الحساب" value={transaction.amount.toLocaleString()} />
                       <InfoCell label="عملة الحساب" value={transaction.currency} />
                    </div>
                    
                    <InfoCell value={amountInWords} fullWidth className="text-xs" />

                    <div className="space-y-1 pt-1">
                        <h3 className="text-center font-bold bg-gray-200 p-0.5 rounded-sm text-sm">البيان</h3>
                        <div className="border border-black rounded-md p-2 space-y-1 text-xs">
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
                            {transaction.hash && (
                                <div className="flex justify-between items-start gap-2">
                                    <span className="font-semibold shrink-0">معرف العملية:</span>
                                    <span className="font-mono text-[10px] break-all text-left">{transaction.hash}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <footer className="flex justify-between items-center mt-2 text-[9px]">
                     <div className="bg-blue-800 text-white p-1 rounded-md">
                        {formattedDate} {formattedTime}
                    </div>
                    <div className="bg-blue-800 text-white p-1 rounded-md font-semibold text-center">
                        هذا الإشعار آلي ولا يحتاج ختم أو توقيع
                    </div>
                </footer>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
