'use client';

import React, { useState, useEffect } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, DollarSign, TrendingUp, ListTodo, Handshake } from "lucide-react";
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

export default function DashboardPage() {
    const [clientCount, setClientCount] = useState<number>(0);
    const [leadCount, setLeadCount] = useState<number>(0);
    const [loadingClients, setLoadingClients] = useState(true);
    const [loadingLeads, setLoadingLeads] = useState(true);

    useEffect(() => {
        const usersRef = ref(db, 'users');
        const unsubscribeClients = onValue(usersRef, (snapshot) => {
            setClientCount(snapshot.size);
            setLoadingClients(false);
        });

        const leadsRef = ref(db, 'leads');
        const unsubscribeLeads = onValue(leadsRef, (snapshot) => {
            setLeadCount(snapshot.size);
            setLoadingLeads(false);
        });

        // Cleanup subscription on unmount
        return () => {
            unsubscribeClients();
            unsubscribeLeads();
        };
    }, []);

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Overview: metrics, recent activity, quick actions"
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loadingClients ? (
                             <div className="text-2xl font-bold">-</div>
                        ) : (
                            <div className="text-2xl font-bold">{clientCount}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Live count from Firebase</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                        <Handshake className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        {loadingLeads ? (
                             <div className="text-2xl font-bold">-</div>
                        ) : (
                            <div className="text-2xl font-bold">{leadCount}</div>
                        )}
                        <p className="text-xs text-muted-foreground">Live count from Firebase</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Revenue</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$25,350</div>
                        <p className="text-xs text-muted-foreground">+12.1% from last month</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Tasks Due</CardTitle>
                        <ListTodo className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">5</div>
                        <p className="text-xs text-muted-foreground">2 overdue</p>
                    </CardContent>
                </Card>
            </div>
             <div className="mt-8 text-center">
                <p className="text-lg text-muted-foreground">Welcome to Customer Central!</p>
                <p className="text-sm text-muted-foreground">Select a module from the sidebar to get started.</p>
            </div>
        </>
    );
}
