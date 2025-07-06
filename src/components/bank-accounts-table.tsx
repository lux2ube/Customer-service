
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
import type { BankAccount } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil, ArrowUp, ArrowDown } from 'lucide-react';
import { updateBankAccountPriority } from '@/lib/actions';

export function BankAccountsTable() {
  const [accounts, setAccounts] = React.useState<BankAccount[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const accountsRef = ref(db, 'bank_accounts/');
    const unsubscribe = onValue(accountsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: BankAccount[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        
        list.sort((a, b) => {
            const priorityA = a.priority ?? Infinity;
            const priorityB = b.priority ?? Infinity;
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }
            
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateB - dateA;
        });

        setAccounts(list);
      } else {
        setAccounts([]);
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
              <TableHead className="w-[120px]">Priority</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Account Number</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts.length > 0 ? (
              accounts.map((account, index) => (
                <TableRow key={account.id}>
                  <TableCell>
                      <div className="flex items-center">
                          <form action={updateBankAccountPriority.bind(null, account.id, 'up')}>
                              <Button type="submit" variant="ghost" size="icon" disabled={index === 0}>
                                  <ArrowUp className="h-4 w-4" />
                              </Button>
                          </form>
                          <form action={updateBankAccountPriority.bind(null, account.id, 'down')}>
                              <Button type="submit" variant="ghost" size="icon" disabled={index === accounts.length - 1}>
                                  <ArrowDown className="h-4 w-4" />
                              </Button>
                          </form>
                      </div>
                  </TableCell>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.account_number || 'N/A'}</TableCell>
                  <TableCell><Badge variant="secondary">{account.currency}</Badge></TableCell>
                   <TableCell>
                    <Badge variant={account.status === 'Active' ? 'default' : 'destructive'}>
                      {account.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{account.createdAt && !isNaN(new Date(account.createdAt).getTime()) ? format(new Date(account.createdAt), 'PPP') : 'N/A'}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="icon">
                        <Link href={`/bank-accounts/${account.id}/edit`}>
                            <Pencil className="h-4 w-4" />
                        </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No bank accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
