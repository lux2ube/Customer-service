
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
import type { CashReceipt } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';

export function CashReceiptsTable() {
  const [receipts, setReceipts] = React.useState<CashReceipt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    const receiptsRef = ref(db, 'cash_receipts/');
    const unsubscribe = onValue(receiptsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: CashReceipt[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReceipts(list);
      } else {
        setReceipts([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  const filteredReceipts = React.useMemo(() => {
    if (!search) return receipts;
    const lowercasedSearch = search.toLowerCase();
    return receipts.filter(r => 
        r.clientName.toLowerCase().includes(lowercasedSearch) ||
        r.senderName.toLowerCase().includes(lowercasedSearch) ||
        r.bankAccountName.toLowerCase().includes(lowercasedSearch) ||
        r.remittanceNumber?.toLowerCase().includes(lowercasedSearch)
    );
  }, [receipts, search]);

  return (
    <div className="space-y-4">
        <div className="flex items-center">
            <Input 
                placeholder="Search by client, sender, bank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />
        </div>
        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Remittance #</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                    Loading receipts...
                    </TableCell>
                </TableRow>
                ) : filteredReceipts.length > 0 ? (
                filteredReceipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                    <TableCell>
                        {receipt.date && !isNaN(new Date(receipt.date).getTime())
                        ? format(new Date(receipt.date), 'PPP')
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="font-medium">{receipt.clientName}</TableCell>
                    <TableCell>{receipt.senderName}</TableCell>
                    <TableCell>{receipt.bankAccountName}</TableCell>
                    <TableCell className="text-right font-mono">
                        {new Intl.NumberFormat().format(receipt.amount)} {receipt.currency}
                    </TableCell>
                     <TableCell>{receipt.remittanceNumber || 'N/A'}</TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                    No cash receipts found.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
    </div>
  );
}
