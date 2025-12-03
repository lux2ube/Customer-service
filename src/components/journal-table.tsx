
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
import { ArrowRight, ArrowDown, ArrowUp } from 'lucide-react';

function isAssetAccount(accountId: string): boolean {
  return accountId.startsWith('1');
}

function isLiabilityAccount(accountId: string): boolean {
  return accountId.startsWith('6') || accountId.startsWith('7');
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
                        const debitIsAsset = isAssetAccount(entry.debit_account);
                        const creditIsAsset = isAssetAccount(entry.credit_account);
                        const debitIsLiability = isLiabilityAccount(entry.debit_account);
                        const creditIsLiability = isLiabilityAccount(entry.credit_account);
                        
                        const debitName = entry.debit_account_name || entry.debit_account;
                        const creditName = entry.credit_account_name || entry.credit_account;
                        
                        let senderName = creditName;
                        let receiverName = debitName;
                        let flowType: 'inflow' | 'outflow' | 'transfer' = 'transfer';
                        
                        if (creditIsAsset && debitIsLiability) {
                          senderName = creditName;
                          receiverName = debitName;
                          flowType = 'outflow';
                        } else if (debitIsAsset && creditIsLiability) {
                          senderName = creditName;
                          receiverName = debitName;
                          flowType = 'inflow';
                        }
                        
                        return (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                               <div className="font-medium flex items-center gap-1">
                                 {flowType === 'outflow' && <Badge variant="destructive" className="text-xs">OUT</Badge>}
                                 {flowType === 'inflow' && <Badge variant="default" className="text-xs bg-green-600">IN</Badge>}
                                 {senderName}
                               </div>
                               <div className="font-mono text-sm text-muted-foreground">
                                    {new Intl.NumberFormat().format(entry.debit_amount)}
                               </div>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <div>
                               <div className="font-medium">{receiverName}</div>
                               <div className="font-mono text-sm text-muted-foreground">
                                    {new Intl.NumberFormat().format(entry.credit_amount)}
                               </div>
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
