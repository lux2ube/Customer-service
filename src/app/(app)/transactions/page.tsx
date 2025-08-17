
'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { TransactionsTable } from "@/components/transactions-table";
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function TransactionsPage() {
    return (
        <div className="space-y-6">
            <PageHeader 
                title="Transactions"
                description="View all consolidated financial transactions."
            >
                <div className="flex flex-wrap items-center gap-2">
                    <Button asChild>
                        <Link href="/transactions/modern">
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add New Transaction
                        </Link>
                    </Button>
                </div>
            </PageHeader>
            <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
                 <TransactionsTable />
            </Suspense>
        </div>
    );
}
