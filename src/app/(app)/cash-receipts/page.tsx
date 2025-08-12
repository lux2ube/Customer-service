
import { PageHeader } from "@/components/page-header";
import { CashReceiptsTable, type UnifiedReceipt } from "@/components/cash-receipts-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/firebase";
import { get, ref } from "firebase/database";
import type { CashReceipt, SmsTransaction, Client } from "@/lib/types";

async function getInitialData(): Promise<{ receipts: UnifiedReceipt[], clients: Client[] }> {
    const [receiptsSnap, smsSnap, clientsSnap] = await Promise.all([
        get(ref(db, 'cash_receipts')),
        get(ref(db, 'sms_transactions')),
        get(ref(db, 'clients')),
    ]);

    const manualReceipts: CashReceipt[] = receiptsSnap.exists() ? Object.keys(receiptsSnap.val()).map(key => ({ id: key, ...receiptsSnap.val()[key] })) : [];
    const smsCredits: SmsTransaction[] = smsSnap.exists() ? Object.values(smsSnap.val()).filter((sms: any) => sms.type === 'credit') : [];

    const unifiedManuals: UnifiedReceipt[] = manualReceipts.map(r => ({
        id: r.id,
        date: r.date,
        clientName: r.clientName,
        senderName: r.senderName,
        bankAccountName: r.bankAccountName,
        amount: r.amount,
        currency: r.currency,
        amountUsd: r.amountUsd,
        remittanceNumber: r.remittanceNumber,
        source: 'Manual',
        status: r.status,
    }));

    const unifiedSms: UnifiedReceipt[] = smsCredits.map((sms: any) => ({
        id: sms.id,
        date: sms.parsed_at,
        clientName: sms.matched_client_name || 'Unmatched',
        senderName: sms.client_name,
        bankAccountName: sms.account_name || 'N/A',
        amount: sms.amount || 0,
        currency: sms.currency || '',
        amountUsd: 0, // This will be calculated on the client side based on rates
        remittanceNumber: sms.transaction_id,
        source: 'SMS',
        status: sms.status,
        rawSms: sms.raw_sms,
    }));

    const allReceipts = [...unifiedManuals, ...unifiedSms];
    allReceipts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    const clients: Client[] = clientsSnap.exists() ? Object.keys(clientsSnap.val()).map(key => ({ id: key, ...clientsSnap.val()[key] })) : [];

    return { receipts: allReceipts, clients };
}

export default async function CashReceiptsPage() {
    const { receipts, clients } = await getInitialData();
    return (
        <>
            <PageHeader
                title="سندات القبض (Cash Receipts)"
                description="عرض وإدارة جميع سندات القبض النقدية."
            >
                <Button asChild>
                    <Link href="/cash-receipts/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        سند قبض جديد
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading receipts...</div>}>
                <CashReceiptsTable initialReceipts={receipts} initialClients={clients} />
            </Suspense>
        </>
    );
}
