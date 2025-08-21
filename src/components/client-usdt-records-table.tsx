
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
import type { ModernUsdtRecord } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { ArrowDown, ArrowUp, Pencil, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';

export function ClientUsdtRecordsTable({ clientId }: { clientId: string }) {
  const [records, setRecords] = React.useState<ModernUsdtRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const recordsRef = query(ref(db, 'modern_usdt_records'), orderByChild('clientId'), equalTo(clientId));
    const unsubscribe = onValue(recordsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: ModernUsdtRecord[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setRecords(list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } else {
        setRecords([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clientId]);
  
  const getStatusVariant = (status: ModernUsdtRecord['status']) => {
        switch(status) {
            case 'Pending': return 'secondary';
            case 'Used': return 'outline';
            case 'Cancelled': return 'destructive';
            case 'Confirmed': return 'default';
            default: return 'secondary';
        }
    }

  return (
    <Card>
        <CardHeader>
            <CardTitle>USDT Records</CardTitle>
            <CardDescription>All USDT inflows and outflows for this client.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="rounded-md border">
                <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Wallet</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center">Loading records...</TableCell></TableRow>
                    ) : records.length > 0 ? (
                    records.map((record) => (
                        <TableRow key={record.id}>
                            <TableCell>{record.date && !isNaN(new Date(record.date).getTime()) ? format(new Date(record.date), 'PPp') : 'N/A'}</TableCell>
                            <TableCell>
                                <span className={cn('flex items-center gap-1', record.type === 'inflow' ? 'text-green-600' : 'text-red-600')}>
                                    {record.type === 'inflow' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                                    {record.type}
                                </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs truncate max-w-[150px]">{record.clientWalletAddress}</TableCell>
                            <TableCell className="text-right font-mono">{new Intl.NumberFormat().format(record.amount)} USDT</TableCell>
                            <TableCell><Badge variant={getStatusVariant(record.status)} className="capitalize">{record.status}</Badge></TableCell>
                            <TableCell className="text-right">
                                {record.txHash && (
                                    <Button asChild variant="ghost" size="icon">
                                        <a href={`https://bscscan.com/tx/${record.txHash}`} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                    </Button>
                                )}
                                <Button asChild variant="ghost" size="icon">
                                    <Link href={`/modern-usdt-records/${record.id}/edit`}>
                                        <Pencil className="h-4 w-4" />
                                    </Link>
                               </Button>
                            </TableCell>
                        </TableRow>
                    ))
                    ) : (
                        <TableRow><TableCell colSpan={6} className="h-24 text-center">No USDT records found.</TableCell></TableRow>
                    )}
                </TableBody>
                </Table>
            </div>
        </CardContent>
    </Card>
  );
}

    