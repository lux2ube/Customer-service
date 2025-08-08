
import { PageHeader } from "@/components/page-header";
import { ServiceProvidersTable } from "@/components/service-providers-table";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { ServiceProvider, Account } from '@/lib/types';

async function getPageData() {
    const providersRef = ref(db, 'service_providers');
    const accountsRef = ref(db, 'accounts');

    const [providersSnapshot, accountsSnapshot] = await Promise.all([
        get(providersRef),
        get(accountsRef)
    ]);
    
    const providers: ServiceProvider[] = providersSnapshot.exists() 
        ? Object.keys(providersSnapshot.val()).map(key => ({ id: key, ...providersSnapshot.val()[key] }))
        : [];
        
    const accounts: Account[] = accountsSnapshot.exists()
        ? Object.keys(accountsSnapshot.val()).map(key => ({ id: key, ...accountsSnapshot.val()[key] }))
        : [];

    return { providers, accounts };
}

export default async function ServiceProvidersPage() {
    const { providers, accounts } = await getPageData();

    return (
        <>
            <PageHeader 
                title="Service Providers"
                description="Group accounts under banks or crypto services for future rule customization."
            >
                <Button asChild>
                    <Link href="/service-providers/add">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Provider
                    </Link>
                </Button>
            </PageHeader>
            <Suspense fallback={<div>Loading providers...</div>}>
                <ServiceProvidersTable initialProviders={providers} allAccounts={accounts} />
            </Suspense>
        </>
    );
}
