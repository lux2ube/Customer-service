
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
import type { Transaction } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import { Pencil } from 'lucide-react';
import Link from 'next/link';

export function TransactionsTable() {
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const transactionsRef = ref(db, 'transactions/');
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: Transaction[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(list);
      } else {
        setTransactions([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusVariant = (status: Transaction['status']) => {
    switch(status) {
        case 'Confirmed': return 'default';
        case 'Cancelled': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  return (
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Amount (USD)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Loading transactions...
                </TableCell>
              </TableRow>
            ) : transactions.length > 0 ? (
              transactions.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell>{format(new Date(tx.date), 'PPP')}</TableCell>
                  <TableCell className="font-medium">{tx.clientName || tx.clientId}</TableCell>
                  <TableCell>
                    <Badge variant={tx.type === 'Deposit' ? 'outline' : 'secondary'}>{tx.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">
                    {new Intl.NumberFormat().format(tx.amount)} {tx.currency}
                  </TableCell>
                   <TableCell className="font-mono">
                    {formatCurrency(tx.amount_usd || 0)}
                  </TableCell>
                  <TableCell>
                      <Badge variant={getStatusVariant(tx.status)}>{tx.status}</Badge>
                  </TableCell>
                   <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                        <Link href={`/transactions/${tx.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                        </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No transactions found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
