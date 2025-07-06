
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
import type { Account, Transaction, JournalEntry } from '@/lib/types';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { Button } from './ui/button';
import { Pencil, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import Link from 'next/link';
import { deleteAccount, updateAccountPriority } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';


export function ChartOfAccountsTable() {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [journalEntries, setJournalEntries] = React.useState<JournalEntry[]>([]);
  const [balances, setBalances] = React.useState<Record<string, { native: number; usd: number }>>({});
  const [loading, setLoading] = React.useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [accountToDelete, setAccountToDelete] = React.useState<Account | null>(null);
  const { toast } = useToast();

  React.useEffect(() => {
    const accountsRef = ref(db, 'accounts');
    const transactionsRef = ref(db, 'transactions');
    const journalEntriesRef = ref(db, 'journal_entries');

    const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
      const data = snapshot.val();
      const list: Account[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      // Sort by priority first, then by ID
      list.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.id.localeCompare(b.id));
      setAccounts(list);
    });

    const unsubscribeTransactions = onValue(transactionsRef, (snapshot) => {
      const data = snapshot.val();
      const list: Transaction[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      setTransactions(list);
    });
    
    const unsubscribeJournal = onValue(journalEntriesRef, (snapshot) => {
      const data = snapshot.val();
      const list: JournalEntry[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
      setJournalEntries(list);
    });

    Promise.all([
      get(accountsRef),
      get(transactionsRef),
      get(journalEntriesRef),
    ]).then(() => setLoading(false));

    return () => {
      unsubscribeAccounts();
      unsubscribeTransactions();
      unsubscribeJournal();
    };
  }, []);

  React.useEffect(() => {
    if (loading) return;

    // 1. Calculate balances for leaf nodes
    const leafBalances: Record<string, { native: number; usd: number }> = {};
    accounts.forEach(acc => {
      if (!acc.isGroup) {
        leafBalances[acc.id] = { native: 0, usd: 0 };
      }
    });

    // Process transactions
    transactions.forEach(tx => {
        if (tx.status !== 'Confirmed') return;
        if (tx.type === 'Deposit') {
            if (tx.bankAccountId && leafBalances[tx.bankAccountId]) {
                leafBalances[tx.bankAccountId].native += tx.amount;
                leafBalances[tx.bankAccountId].usd += tx.amount_usd;
            }
            if (tx.cryptoWalletId && leafBalances[tx.cryptoWalletId]) {
                leafBalances[tx.cryptoWalletId].native -= tx.amount_usdt;
                leafBalances[tx.cryptoWalletId].usd -= tx.amount_usdt;
            }
        } 
        else if (tx.type === 'Withdraw') {
            if (tx.bankAccountId && leafBalances[tx.bankAccountId]) {
                leafBalances[tx.bankAccountId].native -= tx.amount;
                leafBalances[tx.bankAccountId].usd -= tx.amount_usd;
            }
            if (tx.cryptoWalletId && leafBalances[tx.cryptoWalletId]) {
                leafBalances[tx.cryptoWalletId].native += tx.amount_usdt;
                leafBalances[tx.cryptoWalletId].usd += tx.amount_usdt;
            }
        }
    });

    // Process journal entries
    journalEntries.forEach(entry => {
      if (leafBalances[entry.debit_account]) {
        leafBalances[entry.debit_account].native += entry.debit_amount;
        leafBalances[entry.debit_account].usd += entry.amount_usd;
      }
      if (leafBalances[entry.credit_account]) {
        leafBalances[entry.credit_account].native -= entry.credit_amount;
        leafBalances[entry.credit_account].usd -= entry.amount_usd;
      }
    });

    // 2. Aggregate balances up to parent group accounts
    const aggregatedBalances = { ...leafBalances };
    const reversedAccounts = [...accounts].reverse(); 

    reversedAccounts.forEach(account => {
      if (account.isGroup) {
        const children = accounts.filter(child => child.parentId === account.id);
        const totalUsd = children.reduce((sum, child) => {
          return sum + (aggregatedBalances[child.id]?.usd || 0);
        }, 0);
        aggregatedBalances[account.id] = { native: totalUsd, usd: totalUsd };
      }
    });
    
    setBalances(aggregatedBalances);
  }, [accounts, transactions, journalEntries, loading]);


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
    const accountMap = new Map(accounts.map(acc => [acc.id, { ...acc, children: [] as any[] }]));
    const rootAccounts: any[] = [];

    // Build the tree structure
    accounts.forEach(account => {
        const node = accountMap.get(account.id)!;
        if (account.parentId && accountMap.has(account.parentId)) {
            accountMap.get(account.parentId)!.children.push(node);
        } else {
            rootAccounts.push(node);
        }
    });

    // Recursively sort all children arrays by priority
    const sortChildrenRecursive = (nodes: any[]) => {
        nodes.sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || a.id.localeCompare(b.id));
        nodes.forEach(node => {
            if (node.children.length > 0) {
                sortChildrenRecursive(node.children);
            }
        });
    };
    
    sortChildrenRecursive(rootAccounts);
    
    const renderRow = (account: any, level = 0, siblings: any[] = [], index: number = 0) => {
      const isGroup = account.isGroup;
      const balanceInfo = balances[account.id];
      return (
        <React.Fragment key={account.id}>
          <TableRow className={cn(isGroup && 'bg-muted/50')}>
             <TableCell className="w-[100px]">
                  <div className="flex items-center">
                      <form action={updateAccountPriority.bind(null, account.id, account.parentId || null, 'up')}>
                          <Button type="submit" variant="ghost" size="icon" disabled={index === 0}>
                              <ArrowUp className="h-4 w-4" />
                          </Button>
                      </form>
                      <form action={updateAccountPriority.bind(null, account.id, account.parentId || null, 'down')}>
                          <Button type="submit" variant="ghost" size="icon" disabled={index === siblings.length - 1}>
                              <ArrowDown className="h-4 w-4" />
                          </Button>
                      </form>
                  </div>
              </TableCell>
            <TableCell className={cn('font-medium', isGroup && 'font-bold')}>{account.id}</TableCell>
            <TableCell style={{ paddingLeft: `${1 + level * 1.5}rem` }} className={cn(isGroup && 'font-bold')}>{account.name}</TableCell>
            <TableCell>
                <Badge variant={getBadgeVariant(account.type)}>{account.type}</Badge>
            </TableCell>
            <TableCell className="text-right font-mono">
              {balanceInfo !== undefined && (
                isGroup ? (
                  <span>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(balanceInfo.usd)}
                  </span>
                ) : (
                  account.currency && (
                    <span>
                      {
                        account.currency === 'USD' || account.currency === 'USDT' ?
                          new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(balanceInfo.native) :
                          `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balanceInfo.native)} ${account.currency}`
                      }
                    </span>
                  )
                )
              )}
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
          {account.children.map((child: Account, childIndex: number) => renderRow(child, level + 1, account.children, childIndex))}
        </React.Fragment>
      );
    }
    
    return rootAccounts.map((acc, index) => renderRow(acc, 0, rootAccounts, index));
  };


  return (
    <>
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Priority</TableHead>
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
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading accounts and calculating balances...
                </TableCell>
              </TableRow>
            ) : accounts.length > 0 ? (
              renderAccounts()
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
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
              "{accountToDelete?.name}". Any transactions associated with this account may become orphaned.
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
