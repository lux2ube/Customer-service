
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Account } from '@/lib/types';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, query, orderByChild } from 'firebase/database';
import { Button } from './ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { deleteAccount } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';


export function ChartOfAccountsTable() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [accountToDelete, setAccountToDelete] = React.useState<Account | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    // We order by ID (account code) to keep the list structured.
    const accountsRef = query(ref(db, 'accounts'), orderByChild('id'));
    const unsubscribe = onValue(accountsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const list: Account[] = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            })).sort((a, b) => a.id.localeCompare(b.id)); // Sort by ID string
            setAccounts(list);
        } else {
            setAccounts([]);
        }
        setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getBadgeVariant = (type: Account['type']) => {
    switch(type) {
        case 'Assets': return 'default';
        case 'Liabilities': return 'destructive';
        case 'Equity': return 'outline';
        case 'Income': return 'default';
        case 'Expenses': return 'secondary';
        default: return 'secondary';
    }
  }

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (accountToDelete) {
      const result = await deleteAccount(accountToDelete.id);
      if (result?.message) {
        toast({
          variant: 'destructive',
          title: 'Error Deleting Account',
          description: result.message,
        });
      } else {
        toast({
          title: 'Account Deleted',
          description: `Account "${accountToDelete.name}" has been deleted.`,
        });
      }
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
    }
  };

  const renderAccounts = () => {
    const accountMap = new Map(accounts.map(acc => [acc.id, { ...acc, children: [] as Account[] }]));
    const rootAccounts: Account[] = [];

    for (const account of accounts) {
      if (account.parentId && accountMap.has(account.parentId)) {
        accountMap.get(account.parentId)!.children.push(accountMap.get(account.id)!);
      } else {
        rootAccounts.push(accountMap.get(account.id)!);
      }
    }
    
    const renderRow = (account: any, level = 0) => {
      const isGroup = account.isGroup;
      return (
        <React.Fragment key={account.id}>
          <TableRow className={cn(isGroup && 'bg-muted/50')}>
            <TableCell className={cn('font-medium', isGroup && 'font-bold')}>{account.id}</TableCell>
            <TableCell style={{ paddingLeft: `${1 + level * 1.5}rem` }} className={cn(isGroup && 'font-bold')}>{account.name}</TableCell>
            <TableCell>
                <Badge variant={getBadgeVariant(account.type)}>{account.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
                {/* Balance will be implemented later */}
            </TableCell>
            <TableCell className="text-right">
                <Button asChild variant="ghost" size="icon">
                    <Link href={`/accounting/chart-of-accounts/edit/${account.id}`}>
                        <Pencil className="h-4 w-4" />
                    </Link>
                </Button>
                 <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(account)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
            </TableCell>
          </TableRow>
          {account.children.sort((a: Account, b: Account) => a.id.localeCompare(b.id)).map((child: Account) => renderRow(child, level + 1))}
        </React.Fragment>
      );
    }
    
    return rootAccounts.map(acc => renderRow(acc));
  };


  return (
    <>
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts.length > 0 ? (
              renderAccounts()
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
       <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the account
              "{accountToDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
