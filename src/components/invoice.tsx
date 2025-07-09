'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { cn } from "@/lib/utils";
import { CoinCashLogo } from "./coincash-logo";
import { UserCircle, Wallet, Hash, Landmark, ArrowLeftRight, Calendar, FileText } from 'lucide-react';

// A helper component for creating labeled data rows with icons
const InfoRow = ({ icon, label, children }: { icon: React.ElementType, label: string, children: React.ReactNode }) => {
    const Icon = icon;
    return (
        <div className="flex items-start gap-3">
            <Icon className="h-5 w-5 text-gray-500 mt-1 shrink-0" />
            <div className="flex flex-col">
                <span className="text-sm text-gray-500">{label}</span>
                <div className="font-medium text-gray-800">{children}</div>
            </div>
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const isDeposit = transaction.type === 'Deposit';
    const transactionDate = new Date(transaction.date);

    const formatAmount = (num: number, currency: string) => {
        return `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)} ${currency}`;
    }

    const sourceName = isDeposit ? transaction.bankAccountName : client.name;
    const sourceDetail = isDeposit ? `حساب بنكي` : `محفظة العميل`;
    const sourceAmount = isDeposit ? formatAmount(transaction.amount, transaction.currency) : formatAmount(transaction.amount_usdt, 'USDT');
    
    const destinationName = isDeposit ? client.name : transaction.bankAccountName;
    const destinationDetail = isDeposit ? `محفظة العميل` : `حساب بنكي`;
    const destinationAmount = isDeposit ? formatAmount(transaction.amount_usdt, 'USDT') : formatAmount(transaction.amount, transaction.currency);
    
    return (
        <div ref={ref} dir="rtl" className="w-[761px] h-[1080px] bg-gray-50 font-cairo p-8 flex flex-col justify-between text-gray-800">
            <div>
                {/* Header */}
                <header className="flex justify-between items-center pb-6 border-b-2 border-gray-200">
                    <div className="flex items-center gap-4">
                        <CoinCashLogo className="w-20 h-20" />
                        <div>
                            <h1 className="text-3xl font-bold text-blue-900">كوين كاش للدفع الإلكتروني</h1>
                            <p className="text-sm mt-1 text-gray-600">صنعاء - شارع الخمسين</p>
                        </div>
                    </div>
                    <div className="text-left">
                        <h2 className="text-2xl font-semibold text-gray-500">إشعار معاملة</h2>
                        <p className="font-mono text-xs text-gray-400 mt-1" dir="ltr">ID: {transaction.id}</p>
                    </div>
                </header>

                {/* Main Content */}
                <main className="py-8 space-y-8">
                    {/* Client & Date Info */}
                    <section className="grid grid-cols-2 gap-8">
                        <InfoRow icon={UserCircle} label="العميل">
                            <span className="text-lg">{client.name}</span>
                        </InfoRow>
                        <InfoRow icon={Calendar} label="تاريخ المعاملة">
                             <span className="text-lg" dir="ltr">{format(transactionDate, 'dd MMM, yyyy - hh:mm a')}</span>
                        </InfoRow>
                    </section>
                    
                    {/* Financial Flow */}
                    <section className="mt-8">
                        <div className="grid grid-cols-2 gap-6 items-center">
                            {/* From */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
                                <span className="text-sm text-gray-500">من</span>
                                <div className="flex justify-center items-center gap-2 mt-2">
                                    <Landmark className="h-6 w-6 text-blue-800" />
                                    <h3 className="text-xl font-bold text-blue-900">{sourceName}</h3>
                                </div>
                                <p className="text-gray-500 text-xs">{sourceDetail}</p>
                                <p className="text-2xl font-bold text-red-600 mt-4 font-mono" dir="ltr">{sourceAmount}</p>
                            </div>

                             {/* To */}
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-center">
                                <span className="text-sm text-gray-500">إلى</span>
                                <div className="flex justify-center items-center gap-2 mt-2">
                                     <Wallet className="h-6 w-6 text-green-700" />
                                     <h3 className="text-xl font-bold text-green-800">{destinationName}</h3>
                                </div>
                                <p className="text-gray-500 text-xs">{destinationDetail}</p>
                                <p className="text-2xl font-bold text-green-600 mt-4 font-mono" dir="ltr">{destinationAmount}</p>
                            </div>
                        </div>
                    </section>
                    
                    {/* Details Table */}
                    <section className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4 text-gray-700">تفاصيل المعاملة</h3>
                        <div className="space-y-4">
                            <InfoRow icon={ArrowLeftRight} label="نوع المعاملة">
                                <span className="font-semibold">{isDeposit ? 'إيداع' : 'سحب'}</span>
                            </InfoRow>
                            <InfoRow icon={Wallet} label="عنوان محفظة العميل">
                                <p className="font-mono text-sm break-all" dir="ltr">{transaction.client_wallet_address}</p>
                            </InfoRow>
                            <InfoRow icon={Hash} label="رقم توثيق الشبكة (Hash)">
                                <p className="font-mono text-sm break-all" dir="ltr">{transaction.hash}</p>
                            </InfoRow>
                            {transaction.notes && (
                                <InfoRow icon={FileText} label="ملاحظات">
                                    <p>{transaction.notes}</p>
                                </InfoRow>
                            )}
                        </div>
                    </section>
                </main>
            </div>

            {/* Footer */}
            <footer className="mt-auto pt-6 border-t-2 border-dashed border-gray-300 text-center">
                 <div className="bg-blue-50 text-blue-800 text-sm p-4 rounded-lg">
                    <p>هذا الإشعار يصدر تلقائياً من نظام كوين كاش ولا يتطلب توقيعاً. جميع التفاصيل محفوظة لدينا للمراجعة.</p>
                </div>
            </footer>
        </div>
    );
});
Invoice.displayName = 'Invoice';