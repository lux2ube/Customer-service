
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default async function CashPaymentsPage() {
    return (
        <>
            <PageHeader
                title="Cash Payments"
                description="View and manage all recorded cash payments."
            >
                <Button asChild>
                    <Link href="/cash-payments/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Record New Payment
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading payments...</div>}>
                 <Card>
                    <CardContent className="p-6">
                        <p className="text-muted-foreground">Payment history will be displayed here in a future update.</p>
                    </CardContent>
                </Card>
            </Suspense>
        </>
    );
}
