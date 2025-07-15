
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Users2 } from 'lucide-react';
import Link from 'next/link';

export function MergeClientsButton() {
    return (
        <Button variant="outline" asChild>
            <Link href="/clients/merge">
                <Users2 className="mr-2 h-4 w-4" />
                Merge Duplicates
            </Link>
        </Button>
    );
}
