
'use client';

import type { Transaction, Client, CashRecord, UsdtRecord } from "@/lib/types";
import { format, parseISO } from "date-fns";
import React, { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";
import { Landmark, Wallet, XCircle, User, FileText, AlertTriangle, Repeat, Hash, CheckCircle, ArrowDown, ArrowUp, UserCircle, DollarSign } from "lucide-react";
import { Alert, AlertDescription } from "./ui/alert";
import { Separator } from "./ui/separator";

interface InvoiceProps {
    transaction: Transaction;
    client: Client | null;
    linkedRecords: (CashRecord | UsdtRecord)[];
}

const getRecordDetails = (record: CashRecord | UsdtRecord, type: 'inflow' | 'outflow') => {
    if ('currency' in record) { // It's a CashRecord
        return {
            title: `Fiat ${type === 'inflow' ? 'Received' : 'Paid'}`,
            amount: `${record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${record.currency}`,
            icon: Landmark,
            details: [
                { label: type === 'inflow' ? "From" : "To", value: record.senderName || record.recipientName, icon: User },
                { label: "Via Account", value: record.accountName, icon: Landmark },
                { label: "Remittance #", value: record.notes, icon: Repeat }
            ]
        }
    } else { // It's a UsdtRecord
        return {
            title: `USDT ${type === 'inflow' ? 'Received' : 'Paid'}`,
            amount: `${record.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT`,
            icon: Wallet,
            details: [
                { label: type === 'inflow' ? "From Wallet" : "To Wallet", value: record.clientWalletAddress, icon: Wallet },
                { label: "System Wallet", value: record.accountName, icon: Landmark },
                { label: "Tx Hash", value: record.txHash, icon: Hash }
            ]
        }
    }
}


export const Invoice = React.forwardRef<HTMLDivElement, InvoiceProps>(({ transaction, client, linkedRecords }, ref) => {
    
    const [formattedTransactionTime, setFormattedTransactionTime] = useState('...');
    
    useEffect(() => {
        // This ensures date formatting only happens on the client, avoiding hydration mismatches.
        if (transaction.date) {
            setFormattedTransactionTime(format(parseISO(transaction.date), "dd/MM/yyyy, h:mm a"));
        } else {
            setFormattedTransactionTime('N/A');
        }
    }, [transaction.date]);
    
    const isCancelled = transaction.status === 'Cancelled';
    const isModern = !!transaction.summary;
    const { inflows = [], outflows = [] } = transaction;

    return (
        <div ref={ref} dir="rtl" className="w-full max-w-md mx-auto bg-background text-foreground font-cairo">
            <div className="border border-border rounded-lg overflow-hidden">
                <div className="p-4 bg-muted/50">
                    <div className="text-center mb-4">
                        <p className="font-bold text-lg">كوين كاش</p>
                        <p className="text-xs text-muted-foreground">www.ycoincash.com</p>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-start mt-3 text-sm">
                        <div className="flex items-center gap-2">
                           <UserCircle className="h-5 w-5 text-primary" />
                            <div>
                                <p className="font-semibold">عزيزينا العميل</p>
                                <p className="text-xs text-muted-foreground">{client?.name || transaction.clientName}</p>
                                <p className="font-mono text-xs text-muted-foreground">{client?.id}</p>
                            </div>
                        </div>
                         <div className="flex items-center gap-2 text-left">
                            <div className="text-right">
                                <p className="font-semibold">Invoice ID</p>
                                <p className="font-mono text-xs text-muted-foreground">{transaction.id}</p>
                            </div>
                             <FileText className="h-5 w-5 text-primary" />
                        </div>
                    </div>
                </div>

                <Alert variant="destructive" className="border-x-0 border-t-0 rounded-none bg-destructive/10 text-destructive text-justify">
                    <AlertTriangle className="h-5 w-5"/>
                    <AlertDescription className="text-xs leading-relaxed">
                        نحذّركم من إرسال أي مبلغ من محفظتكم لأي شخص أو جهة تدّعي تقديم أرباح أو استثمار مضمون، فهذه من الطرق الشائعة للاحتيال.
                        <br/>
                        ونؤكد بأن العملات الرقمية لا يمكن استرجاعها بعد إرسالها، ولن نتمكن من التدخل أو المساعدة في حال حدوث أي عملية غير آمنة.
                    </AlertDescription>
                </Alert>

                <div className="p-4">
                     {isModern ? (
                        <div className="relative pl-8 pr-4 py-4 space-y-6">
                            {inflows.map((leg, index) => {
                                const record = linkedRecords.find(r => r.id === leg.recordId);
                                if (!record) return null;
                                const { title, amount, details } = getRecordDetails(record, 'inflow');
                                
                                return (
                                    <div key={`in-${index}`}>
                                        <p className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <ArrowDown className="h-5 w-5 text-green-600 flex-shrink-0" />
                                            <span>{title}</span>
                                        </p>
                                        <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md mt-2">
                                            <p className="text-lg font-bold text-primary mb-3">{amount}</p>
                                            <div className="space-y-2 text-xs">
                                                {details.map((d, i) => d.value && (
                                                    <div key={i} className="flex items-start gap-2">
                                                        <d.icon className="h-3 w-3 mt-0.5 text-muted-foreground" />
                                                        <div>
                                                            <p className="text-muted-foreground">{d.label}:</p>
                                                            <p className="font-mono break-all">{d.value}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}

                            {outflows.map((leg, index) => {
                                const record = linkedRecords.find(r => r.id === leg.recordId);
                                if (!record) return null;
                                const { title, amount, details } = getRecordDetails(record, 'outflow');
                                
                                return (
                                    <div key={`out-${index}`}>
                                        <p className="font-semibold text-base mb-2 flex items-center gap-2">
                                            <ArrowUp className="h-5 w-5 text-red-500 flex-shrink-0" />
                                            <span>{title}</span>
                                        </p>
                                        <div className="text-sm text-foreground bg-muted/40 p-3 rounded-md mt-2">
                                            <p className="text-lg font-bold text-green-600 mb-3">{amount}</p>
                                            <div className="space-y-2 text-xs">
                                                {details.map((d, i) => d.value && (
                                                    <div key={i} className="flex items-start gap-2">
                                                        <d.icon className="h-3 w-3 mt-0.5 text-muted-foreground" />
                                                        <div>
                                                            <p className="text-muted-foreground">{d.label}:</p>
                                                            <p className="font-mono break-all">{d.value}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        // Fallback for old transactions
                        <div className="py-4 space-y-4">
                            <p className="text-center text-sm text-muted-foreground">(Legacy Transaction View)</p>
                            <div className="flex justify-between items-center text-lg">
                                <span className="font-semibold">Type:</span>
                                <span className="font-bold">{transaction.type}</span>
                            </div>
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Inflow Amount (USD):</span>
                                <span className="font-mono text-green-600">{transaction.amount_usd?.toLocaleString() || 'N/A'}</span>
                            </div>
                             <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Outflow Amount (USD):</span>
                                <span className="font-mono text-red-500">{transaction.outflow_usd?.toLocaleString() || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Fee (USD):</span>
                                <span className="font-mono">{transaction.fee_usd?.toLocaleString() || 'N/A'}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-muted/50">
                     <p className="text-xs text-muted-foreground text-center">
                        {formattedTransactionTime}
                    </p>
                </div>
            </div>
        </div>
    );
});
Invoice.displayName = 'Invoice';
