
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
import { ArrowRight } from 'lucide-react';

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
                  <TableCell>{entry.date ? format(new Date(entry.date), 'PP') : 'N/A'}</TableCell>
                  <TableCell className="font-medium">{entry.description}</TableCell>
                  <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                           <div className="font-medium">{entry.debit_account_name || entry.debit_account}</div>
                           <div className="font-mono text-sm text-muted-foreground">
                                {new Intl.NumberFormat().format(entry.debit_amount)} {entry.debit_currency}
                           </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <div>
                           <div className="font-medium">{entry.credit_account_name || entry.credit_account}</div>
                           <div className="font-mono text-sm text-muted-foreground">
                                {new Intl.NumberFormat().format(entry.credit_amount)} {entry.credit_currency}
                           </div>
                        </div>
                      </div>
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
