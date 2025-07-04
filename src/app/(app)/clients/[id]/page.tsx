'use client';

import React, { useState, useEffect } from 'react';
import { notFound, useParams } from 'next/navigation';
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { MoreVertical } from "lucide-react";
import { ClientProfileForm } from "@/components/client-profile-form";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DeleteClientDialog } from "@/components/delete-client-dialog";
import type { Client } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';

export default function ClientDetailPage() {
    const params = useParams();
    const id = params.id as string;
    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!id) return;

        const clientRef = ref(db, `users/${id}`);
        const unsubscribe = onValue(clientRef, (snapshot) => {
            if (snapshot.exists()) {
                setClient({ id: snapshot.key, ...snapshot.val() });
            } else {
                setClient(null);
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
    
    if (!client) {
        notFound();
    }

    return (
        <>
            <PageHeader 
                title={client.name}
                description={`Client since ${new Date(client.created_at).toLocaleDateString()}`}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DeleteClientDialog clientId={client.id}>
                             <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive-foreground focus:bg-destructive">
                                Delete Client
                            </DropdownMenuItem>
                        </DeleteClientDialog>
                    </DropdownMenuContent>
                </DropdownMenu>
            </PageHeader>
            <div className="space-y-6">
                <ClientProfileForm client={client} />
            </div>
        </>
    );
}
