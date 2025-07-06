
'use client';

import type { Transaction, Client } from "@/lib/types";
import { format } from "date-fns";
import React from 'react';
import { JaibLogo } from "./jaib-logo";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
    Copy,
    User,
    Phone,
    Calendar,
    Landmark,
    Wallet,
    FileText,
    Hash,
    Paperclip,
    ArrowLeftRight,
} from 'lucide-react';


// --- Arabic Translation and Formatting Helpers ---

const translateType = (type: 'Deposit' | 'Withdraw') => {
    return type === 'Deposit' ? 'إيداع' : 'سحب';
};

const translateCurrency = (currency: string) => {
    switch(currency.toUpperCase()) {
        case 'USD': return 'دولار أمريكي';
        case 'YER': return 'ريال يمني';
        case 'SAR': return 'ريال سعودي';
        case 'USDT': return 'USDT';
        default: return currency;
    }
};

const toArabicWords = (num: number): string => {
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
        if (Math.floor(num / 1000) === 1) words.push('ألف');
        else if (Math.floor(num / 1000) === 2) words.push('ألفان');
        else if (Math.floor(num / 1000) > 2 && Math.floor(num / 1000) < 11) words.push(toArabicWords(Math.floor(num / 1000)) + ' آلاف');
        else words.push(toArabicWords(Math.floor(num / 1000)) + ' ألف');
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
                words.push(units[unit] + ' و' + tens[ten]);
            } else {
                words.push(tens[ten]);
            }
        }
    }
    
    return words.join(' ');
};

const tafqeet = (value: number, currency: string) => {
    const mainCurrency = currency.toUpperCase() === 'USDT' ? 'USDT' : translateCurrency(currency).split(' ')[0];
    const integerPart = Math.floor(value);
    const decimalPart = Math.round((value - integerPart) * 100);

    let result = `${toArabicWords(integerPart)} ${mainCurrency}`;
    if (decimalPart > 0) {
        let subCurrency = '';
        if (currency.toUpperCase() === 'USD') subCurrency = 'سنت';
        if (currency.toUpperCase() === 'SAR') subCurrency = 'هللة';
        if (currency.toUpperCase() === 'YER') subCurrency = 'فلس';
        if (subCurrency) {
            result += ` و ${toArabicWords(decimalPart)} ${subCurrency}`;
        }
    }
    return `فقط ${result} لا غير.`;
};


// --- Components ---

const DetailItem = ({ icon, label, value, canCopy = false, isLink = false }: { icon: React.ElementType, label: string, value?: string | number, canCopy?: boolean, isLink?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!value) return;
        navigator.clipboard.writeText(String(value));
        toast({ title: "تم النسخ!", description: `${label} تم نسخه إلى الحافظة.` });
    };

    if (value === undefined || value === null || value === '') return null;

    const Icon = icon;

    const content = (
        <div className="flex items-center gap-2 text-xs text-right text-gray-700 dark:text-gray-300">
            {canCopy && (
                <button onClick={handleCopy} className="text-gray-400 hover:text-primary shrink-0">
                    <Copy size={12} />
                </button>
            )}
            <p className={cn("font-mono", isLink && "underline text-primary")}>{String(value)}</p>
        </div>
    );

    return (
        <div className="flex justify-between items-center py-1.5 px-2 rounded-md hover:bg-muted/50">
            <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary/70" />
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
            </div>
            {isLink ? <a href={String(value)} target="_blank" rel="noopener noreferrer">{content}</a> : content}
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const formatCurrency = (value: number | undefined, currency: string) => {
        if (value === undefined || value === null) return 'N/A';
        // Format with commas, no currency symbol
        return new Intl.NumberFormat('en-US').format(value);
    }

    const formattedDate = transaction.date && !isNaN(new Date(transaction.date).getTime())
        ? format(new Date(transaction.date), 'yyyy-MM-dd @ hh:mm a')
        : 'N/A';
        
    const isDeposit = transaction.type === 'Deposit';
    const totalAmount = transaction.amount_usdt;

    return (
        <div ref={ref} dir="rtl" className="bg-gray-50 dark:bg-gray-800 p-4 font-[system-ui] text-gray-800">
            <div className="w-full max-w-3xl mx-auto bg-white dark:bg-card shadow-lg rounded-xl overflow-hidden border">
                <header className="bg-gradient-to-l from-primary via-primary/90 to-teal-600 text-primary-foreground p-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 p-1.5 rounded-lg">
                                <JaibLogo className="h-6 w-auto text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold">إيصال معاملة</h1>
                                <p className="text-xs opacity-80 font-mono tracking-wider">#{transaction.id.slice(-8).toUpperCase()}</p>
                            </div>
                        </div>
                        <Badge variant={transaction.status === 'Confirmed' ? 'default' : 'destructive'} className="bg-white/90 text-primary font-bold">
                            {transaction.status === 'Confirmed' ? 'مؤكدة' : (transaction.status === 'Pending' ? 'قيد الانتظار' : 'ملغاة')}
                        </Badge>
                    </div>
                </header>
                
                <main className="p-4 space-y-4">
                    <div className="p-3 text-sm text-center bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                        <p>
                            <span className="font-semibold">عميلنا العزيز {client.name}</span>، لقد قمت بإجراء معاملة <span className="font-semibold text-primary">{translateType(transaction.type)}</span> بنجاح.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        {/* Right Column */}
                        <div className="p-3 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card">
                            <h3 className="text-sm font-bold text-gray-500 mb-2">معلومات العميل والعملية</h3>
                            <DetailItem icon={User} label="اسم العميل" value={client.name} />
                            <DetailItem icon={Phone} label="رقم الهاتف" value={client.phone} />
                            <DetailItem icon={Calendar} label="تاريخ العملية" value={formattedDate} />
                            <DetailItem icon={ArrowLeftRight} label="نوع العملية" value={translateType(transaction.type)} />
                            <DetailItem icon={FileText} label="رقم الحوالة" value={transaction.remittance_number} />
                        </div>

                        {/* Left Column */}
                        <div className="p-3 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card">
                             <h3 className="text-sm font-bold text-gray-500 mb-2">معلومات الحسابات والمحافظ</h3>
                             <DetailItem icon={Landmark} label="الحساب البنكي" value={transaction.bankAccountName} />
                             <DetailItem icon={Wallet} label="محفظة الشركة" value={transaction.cryptoWalletName} />
                             <DetailItem icon={Wallet} label="محفظة العميل" value={transaction.client_wallet_address} canCopy />
                             <DetailItem icon={Hash} label="معرّف العملية (Txid)" value={transaction.hash} canCopy />
                             {transaction.attachment_url && <DetailItem icon={Paperclip} label="مرفق" value={transaction.attachment_url} isLink />}
                        </div>
                    </div>
                    
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                            <thead className="bg-gray-100 dark:bg-muted/50">
                                <tr>
                                    <th className="p-2 text-right font-semibold">الوصف</th>
                                    <th className="p-2 text-center font-semibold">المبلغ الأصلي</th>
                                    <th className="p-2 text-center font-semibold">القيمة (USD)</th>
                                    <th className="p-2 text-center font-semibold">الرسوم/المصاريف (USD)</th>
                                    <th className="p-2 text-left font-semibold">المبلغ النهائي (USDT)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-t">
                                    <td className="p-2">
                                        <p className="font-semibold">{translateType(transaction.type)}</p>
                                        <p className="text-muted-foreground">{transaction.bankAccountName}</p>
                                    </td>
                                    <td className="p-2 text-center font-mono">{formatCurrency(transaction.amount, transaction.currency)} {transaction.currency}</td>
                                    <td className="p-2 text-center font-mono">{formatCurrency(transaction.amount_usd, 'USD')}</td>
                                    <td className="p-2 text-center font-mono text-red-600">{formatCurrency((transaction.fee_usd || 0) + (transaction.expense_usd || 0), 'USD')}</td>
                                    <td className="p-2 text-left font-mono font-semibold">{formatCurrency(transaction.amount_usdt, 'USDT')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    
                    {transaction.notes && (
                         <div className="p-2 text-xs border rounded-lg bg-gray-50 dark:bg-card">
                            <p><span className="font-bold">ملاحظات:</span> {transaction.notes}</p>
                        </div>
                    )}

                </main>

                <footer className="p-4 bg-gray-100 dark:bg-muted/30">
                     <div className="flex justify-between items-center">
                        <div className="text-xs">
                            <p className="font-bold">المبلغ الإجمالي كتابةً:</p>
                            <p className="text-primary font-semibold">{tafqeet(totalAmount, 'USDT')}</p>
                        </div>
                        <div className="text-left">
                            <p className="text-sm text-muted-foreground">الإجمالي النهائي</p>
                            <p className={cn("text-2xl font-bold font-mono", isDeposit ? 'text-green-600' : 'text-red-600')}>
                                {formatCurrency(totalAmount, 'USDT')} USDT
                            </p>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
