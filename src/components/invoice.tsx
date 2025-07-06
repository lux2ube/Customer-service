
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
    CircleDollarSign,
    Receipt,
} from 'lucide-react';


// --- Arabic Translation and Formatting Helpers ---

const translateType = (type: 'Deposit' | 'Withdraw') => {
    return type === 'Deposit' ? 'إيداع' : 'سحب';
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
    const mainCurrency = currency.toUpperCase() === 'USDT' ? 'USDT' : 'دولار';
    const integerPart = Math.floor(value);
    const decimalPart = Math.round((value - integerPart) * 100);

    let result = `${toArabicWords(integerPart)} ${mainCurrency}`;
    if (decimalPart > 0) {
        let subCurrency = 'سنت';
        result += ` و ${toArabicWords(decimalPart)} ${subCurrency}`;
    }
    return `فقط ${result} لا غير.`;
};


// --- Components ---

const DetailItem = ({ icon, label, value, canCopy = false, isLink = false, isFee = false }: { icon: React.ElementType, label: string, value?: string | number, canCopy?: boolean, isLink?: boolean, isFee?: boolean }) => {
    const { toast } = useToast();

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!value) return;
        navigator.clipboard.writeText(String(value));
        toast({ title: "تم النسخ!", description: `${label} تم نسخه إلى الحافظة.` });
    };

    if (value === undefined || value === null || value === '' || (typeof value === 'number' && isNaN(value)) ) return null;

    const Icon = icon;

    const content = (
        <div className="flex items-center gap-1.5 text-right text-gray-700 dark:text-gray-300">
            {canCopy && (
                <button onClick={handleCopy} className="text-gray-400 hover:text-primary shrink-0">
                    <Copy size={12} />
                </button>
            )}
            <p className={cn("font-mono", isLink && "underline text-primary", isFee && "text-destructive")}>{String(value)}</p>
        </div>
    );

    return (
        <div className="flex justify-between items-center py-1 px-2 rounded-md hover:bg-muted/50">
            <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-primary/70" />
                <p className="font-medium text-muted-foreground">{label}</p>
            </div>
            {isLink ? <a href={String(value)} target="_blank" rel="noopener noreferrer">{content}</a> : content}
        </div>
    );
};

export const Invoice = React.forwardRef<HTMLDivElement, { transaction: Transaction; client: Client }>(({ transaction, client }, ref) => {
    
    const formatCurrency = (value: number | undefined, currency: string) => {
        if (value === undefined || value === null) return 'N/A';
        return new Intl.NumberFormat('en-US').format(value);
    }

    const formattedDate = transaction.date && !isNaN(new Date(transaction.date).getTime())
        ? format(new Date(transaction.date), 'yyyy-MM-dd @ hh:mm a')
        : 'N/A';
        
    const totalAmount = transaction.amount_usdt;

    return (
        <div ref={ref} dir="rtl" className="bg-gray-50 dark:bg-gray-800 p-4 font-[system-ui] text-gray-800">
            <div className="w-full max-w-4xl mx-auto bg-white dark:bg-card shadow-lg rounded-xl overflow-hidden border">
                <header className="bg-gradient-to-l from-primary via-primary/90 to-teal-600 text-primary-foreground p-3 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-white/20 p-1.5 rounded-lg">
                            <JaibLogo className="h-6 w-auto text-white" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold">إيصال معاملة</h1>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs opacity-80 font-mono tracking-wider">#{transaction.id.slice(-8).toUpperCase()}</p>
                        <Badge variant={transaction.status === 'Confirmed' ? 'default' : 'destructive'} className="bg-white/90 text-primary font-bold text-xs">
                            {transaction.status === 'Confirmed' ? 'مؤكدة' : (transaction.status === 'Pending' ? 'قيد الانتظار' : 'ملغاة')}
                        </Badge>
                    </div>
                </header>
                
                <main className="p-3 text-xs">
                     <div className="p-2 text-center bg-teal-50 dark:bg-teal-900/20 rounded-lg mb-3">
                        <p>
                            <span className="font-semibold">عميلنا العزيز {client.name}</span>، لقد قمت بإجراء معاملة <span className="font-semibold text-primary">{translateType(transaction.type)}</span> بنجاح.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Column 1 */}
                        <div className="p-2 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card">
                            <h3 className="text-xs font-bold text-gray-500 mb-1 border-b pb-1">معلومات العميل</h3>
                            <DetailItem icon={User} label="اسم العميل" value={client.name} />
                            <DetailItem icon={Phone} label="رقم الهاتف" value={client.phone} />
                            <DetailItem icon={Calendar} label="تاريخ العملية" value={formattedDate} />
                        </div>

                        {/* Column 2 */}
                        <div className="p-2 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card">
                             <h3 className="text-xs font-bold text-gray-500 mb-1 border-b pb-1">معلومات الحسابات</h3>
                             <DetailItem icon={ArrowLeftRight} label="نوع العملية" value={translateType(transaction.type)} />
                             <DetailItem icon={Landmark} label="الحساب البنكي" value={transaction.bankAccountName} />
                             <DetailItem icon={Wallet} label="محفظة الشركة" value={transaction.cryptoWalletName} />
                             <DetailItem icon={Wallet} label="محفظة العميل" value={transaction.client_wallet_address} canCopy />
                        </div>

                        {/* Column 3 */}
                        <div className="p-2 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card">
                             <h3 className="text-xs font-bold text-gray-500 mb-1 border-b pb-1">تفاصيل مالية (USD)</h3>
                             <DetailItem icon={CircleDollarSign} label={`المبلغ (${transaction.currency})`} value={formatCurrency(transaction.amount, transaction.currency)} />
                             <DetailItem icon={CircleDollarSign} label="القيمة (USD)" value={formatCurrency(transaction.amount_usd, 'USD')} />
                             <DetailItem icon={Receipt} label="رسوم/مصاريف" value={formatCurrency((transaction.fee_usd || 0) + (transaction.expense_usd || 0), 'USD')} isFee={true} />
                             <DetailItem icon={CircleDollarSign} label="النهائي (USDT)" value={formatCurrency(transaction.amount_usdt, 'USDT')} />
                        </div>

                        {/* Transaction Data */}
                        <div className="p-2 border rounded-lg space-y-1 bg-gray-50/50 dark:bg-card col-span-full">
                            <h3 className="text-xs font-bold text-gray-500 mb-1 border-b pb-1">بيانات العملية</h3>
                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3">
                                <DetailItem icon={FileText} label="رقم الحوالة" value={transaction.remittance_number} />
                                <DetailItem icon={Hash} label="معرّف العملية (Txid)" value={transaction.hash} canCopy />
                                {transaction.attachment_url && <DetailItem icon={Paperclip} label="مرفق" value={transaction.attachment_url} isLink />}
                            </div>
                            {transaction.notes && (
                                <div className="pt-1">
                                    <p><span className="font-bold">ملاحظات:</span> {transaction.notes}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                <footer className="p-3 bg-gray-100 dark:bg-muted/30">
                     <div className="flex justify-between items-center">
                        <div className="text-xs max-w-[60%]">
                            <p className="font-bold">المبلغ الإجمالي كتابةً:</p>
                            <p className="text-primary font-semibold">{tafqeet(totalAmount, 'USDT')}</p>
                        </div>
                        <div className="text-left">
                            <p className="text-xs text-muted-foreground">الإجمالي النهائي</p>
                            <p className={cn("text-xl font-bold font-mono", transaction.type === 'Deposit' ? 'text-green-600' : 'text-red-600')}>
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
