'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

export default function DashboardPage() {
    const [customerCount, setCustomerCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const usersRef = ref(db, 'users');
        const unsubscribe = onValue(usersRef, (snapshot) => {
            setCustomerCount(snapshot.size);
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Here's a real-time snapshot of your CRM activity."
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                             <div className="text-2xl font-bold">-</div>
                        ) : (
                            <div className="text-2xl font-bold">{customerCount}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Live count from Firebase</p>
                    </CardContent>
                </Card>
            </div>
             <div className="mt-8 text-center">
                <p className="text-lg text-muted-foreground">Welcome to your new Firebase-powered CRM!</p>
                <p className="text-sm text-muted-foreground">Navigate to the 'Customers' tab to see your live data.</p>
            </div>
        </>
    );
}
