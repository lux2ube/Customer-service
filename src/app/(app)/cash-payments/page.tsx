
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CashPaymentsTable, type UnifiedPayment } from "@/components/cash-payments-table";
import { db } from "@/lib/firebase";
import { get, ref } from "firebase/database";
import type { CashPayment, SmsTransaction, Client } from "@/lib/types";


async function getInitialData(): Promise<{ payments: UnifiedPayment[], clients: Client[] }> {
    const [paymentsSnap, smsSnap, clientsSnap] = await Promise.all([
        get(ref(db, 'cash_payments')),
        get(ref(db, 'sms_transactions')),
        get(ref(db, 'clients')),
    ]);

    const manualPayments: CashPayment[] = paymentsSnap.exists() ? Object.keys(paymentsSnap.val()).map(key => ({ id: key, ...paymentsSnap.val()[key] })) : [];
    const smsDebits: SmsTransaction[] = smsSnap.exists() ? Object.values(smsSnap.val()).filter((sms: any) => sms.type === 'debit') : [];

    const unifiedManuals: UnifiedPayment[] = manualPayments.map(p => ({
        id: p.id,
        date: p.date,
        clientName: p.clientName,
        recipientName: p.recipientName,
        bankAccountName: p.bankAccountName,
        amount: p.amount,
        currency: p.currency,
        remittanceNumber: p.remittanceNumber,
        source: 'Manual',
        status: p.status,
    }));

    const unifiedSms: UnifiedPayment[] = smsDebits.map((sms: any) => ({
        id: sms.id,
        date: sms.parsed_at,
        clientName: sms.matched_client_name || 'Unmatched',
        recipientName: sms.client_name,
        bankAccountName: sms.account_name || 'N/A',
        amount: sms.amount || 0,
        currency: sms.currency || '',
        remittanceNumber: sms.transaction_id,
        source: 'SMS',
        status: sms.status,
        rawSms: sms.raw_sms,
    }));
    
    const allPayments = [...unifiedManuals, ...unifiedSms];
    allPayments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const clients: Client[] = clientsSnap.exists() ? Object.keys(clientsSnap.val()).map(key => ({ id: key, ...clientsSnap.val()[key] })) : [];

    return { payments: allPayments, clients };
}


export default async function CashPaymentsPage() {
    const { payments, clients } = await getInitialData();
    
    return (
        <>
            <PageHeader
                title="سندات الصرف (Cash Payments)"
                description="عرض وإدارة جميع المدفوعات النقدية المسجلة والمعاملات الصادرة عبر الرسائل القصيرة."
            >
                <Button asChild>
                    <Link href="/cash-payments/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        سند صرف جديد
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading payments...</div>}>
                 <CashPaymentsTable initialPayments={payments} initialClients={clients} />
            </Suspense>
        </>
    );
}
