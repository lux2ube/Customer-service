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
import { Input } from '@/components/ui/input';
import type { Transaction } from '@/lib/types';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export function TransactionsTable() {
  const [allTransactions, setAllTransactions] = React.useState<Transaction[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    const transactionsRef = ref(db, 'transactions/');
    const unsubscribe = onValue(transactionsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const transactionsList: Transaction[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // Sort by most recent
        setAllTransactions(transactionsList);
      } else {
        setAllTransactions([]);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const filteredTransactions = React.useMemo(() => {
    if (!searchTerm) {
      return allTransactions;
    }
    return allTransactions.filter(transaction =>
        transaction.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allTransactions, searchTerm]);

  const getStatusVariant = (status: Transaction['status']) => {
    switch (status) {        
        case 'Confirmed':
            return 'default';
        case 'Cancelled':
            return 'destructive';
        case 'Pending':
        default:
            return 'secondary';
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 pb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full"
            disabled={loading}
          />
        </div>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Loading transactions from Firebase...
                </TableCell>
              </TableRow>
            ) : filteredTransactions.length > 0 ? (
              filteredTransactions.map(tx => (
                <TableRow key={tx.id} className="cursor-pointer" onClick={() => { /* Placeholder for future navigation to tx detail */}}>
                  <TableCell>{tx.createdAt ? format(new Date(tx.createdAt), 'PPP p') : 'N/A'}</TableCell>
                  <TableCell>
                    <div className="font-medium">{tx.clientName}</div>
                  </TableCell>
                  <TableCell>{tx.type}</TableCell>
                  <TableCell>
                    <div className={`font-medium ${tx.type === 'Deposit' ? 'text-green-600' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}
                    </div>
                  </TableCell>
                  <TableCell>
                      <Badge variant={getStatusVariant(tx.status)}>
                          {tx.status}
                      </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No transactions found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
