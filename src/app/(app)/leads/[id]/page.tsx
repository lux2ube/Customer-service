'use client';

import React, { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { LeadProfileForm } from "@/components/lead-profile-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteLeadDialog } from "@/components/delete-lead-dialog";
import type { Lead } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeadDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const leadRef = ref(db, `leads/${id}`);
        const unsubscribe = onValue(leadRef, (snapshot) => {
            if (snapshot.exists()) {
                setLead({ id: snapshot.key, ...snapshot.val() });
            } else {
                setLead(null);
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
    
    if (!lead) {
        notFound();
    }

    return (
        <>
            <PageHeader 
                title={lead.name}
                description={`Lead since ${new Date(lead.created_at).toLocaleDateString()}`}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DeleteLeadDialog leadId={lead.id}>
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive-foreground focus:bg-destructive">
                                Delete Lead
                            </DropdownMenuItem>
                        </DeleteLeadDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </PageHeader>
            <div className="space-y-6">
                <LeadProfileForm lead={lead} />
            </div>
        </>
    );
}
