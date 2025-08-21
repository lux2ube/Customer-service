

'use client';

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { UnifiedFinancialRecord } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { ArrowDown, ArrowUp, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Checkbox } from './ui/checkbox';


interface ClientCashRecordsTableProps {
  records: UnifiedFinancialRecord[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (id: string, selected: boolean) => void;
}

export function ClientCashRecordsTable({ records, loading, selectedIds, onSelectionChange }: ClientCashRecordsTableProps) {
  
  const getStatusVariant = (status: UnifiedFinancialRecord['status']) => {
        switch(status) {
            case 'Pending': return 'secondary';
            case 'Matched': return 'default';
            case 'Used': return 'outline';
            case 'Cancelled': return 'destructive';
            case 'Confirmed': return 'default';
            default: return 'secondary';
        }
    }

  return (
    <Card>
        <CardHeader>
            <CardTitle>Cash Records</CardTitle>
            <CardDescription>All cash inflows and outflows for this client.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
                <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-10">
                            <Checkbox
                                checked={records.length > 0 && records.every(r => selectedIds.includes(r.id))}
                                onCheckedChange={(checked) => records.forEach(r => onSelectionChange(r.id, !!checked))}
                             />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Sender/Recipient</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={8} className="h-24 text-center">Loading records...</TableCell></TableRow>
                    ) : records.length > 0 ? (
                    records.map((record) => (
                        <TableRow key={record.id} data-state={selectedIds.includes(record.id) && "selected"}>
                             <TableCell>
                                <Checkbox
                                    checked={selectedIds.includes(record.id)}
                                    onCheckedChange={(checked) => onSelectionChange(record.id, !!checked)}
                                />
                            </TableCell>
                            <TableCell>{record.date && !isNaN(new Date(record.date).getTime()) ? format(new Date(record.date), 'PPp') : 'N/A'}</TableCell>
                            <TableCell>
                                <span className={cn('flex items-center gap-1', record.type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                                    {record.type === 'inflow' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                                    {record.type}
                                </span>
                            </TableCell>
                            <TableCell>{record.senderName || record.recipientName}</TableCell>
                            <TableCell>{record.bankAccountName}</TableCell>
                            <TableCell className="text-right font-mono">{new Intl.NumberFormat().format(record.amount)} {record.currency}</TableCell>
                            <TableCell><Badge variant={getStatusVariant(record.status)} className="capitalize">{record.status}</Badge></TableCell>
                            <TableCell className="text-right">
                               <Button asChild variant="ghost" size="icon">
                                    <Link href={`/modern-cash-records/${record.id}/edit`}>
                                        <Pencil className="h-4 w-4" />
                                    </Link>
                               </Button>
                            </TableCell>
                        </TableRow>
                    ))
                    ) : (
                        <TableRow><TableCell colSpan={8} className="h-24 text-center">No cash records found.</TableCell></TableRow>
                    )}
                </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
  );
}

    
