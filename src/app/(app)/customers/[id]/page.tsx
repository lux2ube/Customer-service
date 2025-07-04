'use client';

import React, { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { CustomerProfileForm } from "@/components/customer-profile-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteCustomerDialog } from "@/components/delete-customer-dialog";
import type { Customer } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

export default function CustomerDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const customerRef = ref(db, `users/${id}`);
        const unsubscribe = onValue(customerRef, (snapshot) => {
            if (snapshot.exists()) {
                setCustomer({ id: snapshot.key, ...snapshot.val() });
            } else {
                setCustomer(null);
            }
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [id]);

    if (loading) {
        return (
            <>
                <PageHeader 
                    title={<Skeleton className="h-8 w-48" />}
                    description={<Skeleton className="h-4 w-64" />}
                />
                <div className="space-y-6">
                   <Skeleton className="h-96 w-full" />
                </div>
            </>
        );
    }
    
    if (!customer) {
        notFound();
    }

    return (
        <>
            <PageHeader 
                title={customer.name}
                description={`Customer since ${new Date(customer.created_at).toLocaleDateString()}`}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DeleteCustomerDialog customerId={customer.id}>
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive-foreground focus:bg-destructive">
                                Delete Customer
                            </DropdownMenuItem>
                        </DeleteCustomerDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </PageHeader>
            <div className="space-y-6">
                <CustomerProfileForm customer={customer} />
            </div>
        </>
    );
}
