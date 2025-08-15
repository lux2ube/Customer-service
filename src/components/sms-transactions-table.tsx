
'use client';

// THIS COMPONENT IS DEPRECATED.
// All functionality has been moved to modern-cash-records-table.tsx
// This file is kept to avoid breaking imports but should not be used.

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export function SmsTransactionsTable() {
    return (
    <div className="rounded-md border bg-card">
        <Table>
            <TableHeader><TableRow><TableHead>Info</TableHead></TableRow></TableHeader>
            <TableBody>
                <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground">
                        This component is deprecated. Please use the Modern Cash Records page.
                    </TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </div>
    );
}
