
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
import type { MexcPendingDeposit } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Eye } from 'lucide-react';

export function MexcDepositsTable() {
  const [deposits, setDeposits] = React.useState<MexcPendingDeposit[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const depositsRef = ref(db, 'mexc_pending_deposits/');
    const unsubscribe = onValue(depositsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: MexcPendingDeposit[] = Object.keys(data)
            .map(key => ({ id: key, ...data[key] }))
            .filter(d => d.status === 'pending-review'); // Only show pending
        
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setDeposits(list);
      } else {
        setDeposits([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat('en-US').format(value) + ` ${currency}`;
  }

  return (
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created At</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Bank Account</TableHead>
              <TableHead>SMS Amount</TableHead>
              <TableHead>Calculated USDT</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Loading pending deposits...
                </TableCell>
              </TableRow>
            ) : deposits.length > 0 ? (
              deposits.map((deposit) => (
                <TableRow key={deposit.id}>
                  <TableCell>
                    {format(new Date(deposit.createdAt), 'Pp')}
                  </TableCell>
                  <TableCell className="font-medium">{deposit.clientName}</TableCell>
                  <TableCell>{deposit.smsBankAccountName}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(deposit.smsAmount, deposit.smsCurrency)}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(deposit.calculatedUsdtAmount, 'USDT')}</TableCell>
                  <TableCell><Badge variant="secondary">{deposit.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                        <Link href={`/mexc-deposits/review/${deposit.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Review
                        </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No pending deposits to review.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
