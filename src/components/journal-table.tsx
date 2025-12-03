
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
import type { JournalEntry } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from 'lucide-react';

function isPaymentTransaction(description: string): boolean {
  const desc = description.toLowerCase();
  return desc.includes('payout') || desc.includes('payment') || desc.includes('outflow') || desc.includes('send');
}

function isReceiptTransaction(description: string): boolean {
  const desc = description.toLowerCase();
  return desc.includes('receipt') || desc.includes('inflow') || desc.includes('receive') || desc.includes('deposit');
}

export function JournalTable() {
  const [entries, setEntries] = React.useState<JournalEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const entriesRef = ref(db, 'journal_entries/');
    const unsubscribe = onValue(entriesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: JournalEntry[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEntries(list);
      } else {
        setEntries([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Transfer Details</TableHead>
              <TableHead className="text-right">Value (USD)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Loading journal entries...
                </TableCell>
              </TableRow>
            ) : entries.length > 0 ? (
              entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.date && !isNaN(new Date(entry.date).getTime())
                      ? format(new Date(entry.date), 'PP')
                      : 'N/A'}
                  </TableCell>
                  <TableCell className="font-medium">{entry.description}</TableCell>
                  <TableCell>
                      {(() => {
                        const debitName = entry.debit_account_name || entry.debit_account;
                        const creditName = entry.credit_account_name || entry.credit_account;
                        const description = entry.description || '';
                        
                        const isPayment = isPaymentTransaction(description);
                        const isReceipt = isReceiptTransaction(description);
                        
                        let change: 'increase' | 'decrease' = 'decrease';
                        if (isReceipt) {
                          change = 'increase';
                        } else if (isPayment) {
                          change = 'decrease';
                        }
                        
                        return (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {change === 'decrease' ? (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              ) : (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              )}
                              <span className="font-medium">{debitName}</span>
                              <Badge variant={change === 'decrease' ? 'destructive' : 'default'} className={`text-xs ${change === 'increase' ? 'bg-green-600' : ''}`}>
                                {change === 'decrease' ? '↓ Decrease' : '↑ Increase'}
                              </Badge>
                              <span className="font-mono text-sm">${new Intl.NumberFormat().format(entry.debit_amount)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {change === 'decrease' ? (
                                <TrendingDown className="h-4 w-4 text-red-500" />
                              ) : (
                                <TrendingUp className="h-4 w-4 text-green-500" />
                              )}
                              <span className="font-medium">{creditName}</span>
                              <Badge variant={change === 'decrease' ? 'destructive' : 'default'} className={`text-xs ${change === 'increase' ? 'bg-green-600' : ''}`}>
                                {change === 'decrease' ? '↓ Decrease' : '↑ Increase'}
                              </Badge>
                              <span className="font-mono text-sm">${new Intl.NumberFormat().format(entry.credit_amount)}</span>
                            </div>
                          </div>
                        );
                      })()}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(entry.amount_usd)}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No journal entries found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
