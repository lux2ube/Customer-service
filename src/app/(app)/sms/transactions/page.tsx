
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ArrowRight, BookCopy } from 'lucide-react';
import Link from 'next/link';

export default function SmsTransactionsPage() {
    return (
        <>
            <PageHeader
                title="Legacy SMS Transactions"
                description="This page is no longer in use."
            >
            </PageHeader>
            <Alert>
                <BookCopy className="h-4 w-4" />
                <AlertTitle>This View is Deprecated</AlertTitle>
                <AlertDescription>
                    All SMS transactions are now managed as part of the unified Modern Cash Records. 
                    Please use that page to view and manage all cash inflows, including those from SMS.
                </AlertDescription>
                <div className="mt-4">
                    <Button asChild>
                        <Link href="/modern-cash-records">
                            Go to Modern Cash Records <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </Alert>
        </>
    );
}
