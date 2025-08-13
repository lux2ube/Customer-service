
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { SmsTransactionsTable } from "@/components/sms-transactions-table";
import { Suspense } from "react";

export default function SmsTransactionsPage() {
    return (
        <>
            <PageHeader
                title="Legacy SMS Transactions"
                description="View and manage transactions parsed from incoming SMS messages. New records appear in Modern Cash Records."
            >
            </PageHeader>
            <Suspense fallback={<div>Loading transactions...</div>}>
                <SmsTransactionsTable />
            </Suspense>
        </>
    );
}
