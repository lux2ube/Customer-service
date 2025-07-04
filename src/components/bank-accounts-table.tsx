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
import { Pencil } from 'lucide-react';

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
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts.length > 0 ? (
              accounts.map(account => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell>{account.account_number || 'N/A'}</TableCell>
                  <TableCell><Badge variant="secondary">{account.currency}</Badge></TableCell>
                   <TableCell>
                    <Badge variant={account.status === 'Active' ? 'default' : 'destructive'}>
                      {account.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(account.createdAt), 'PPP')}</TableCell>
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
                <TableCell colSpan={6} className="h-24 text-center">
                  No bank accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
