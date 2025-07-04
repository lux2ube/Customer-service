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
import type { Account } from '@/lib/types';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';


const initialAccounts: Account[] = [
    // Assets
    { id: '100', name: 'Assets', type: 'Assets', isGroup: true },
    { id: '101', name: 'Cash - YER', type: 'Assets', isGroup: false },
    { id: '102', name: 'Cash - USD', type: 'Assets', isGroup: false },
    { id: '103', name: 'Cash - SAR', type: 'Assets', isGroup: false },
    { id: '110', name: 'Bank - YER', type: 'Assets', isGroup: false },
    { id: '111', name: 'Bank - USD', type: 'Assets', isGroup: false },
    { id: '112', name: 'Bank - SAR', type: 'Assets', isGroup: false },
    { id: '120', name: 'USDT Wallet (BEP20)', type: 'Assets', isGroup: false },
    { id: '130', name: 'Pending Fiat Receivables', type: 'Assets', isGroup: false },
    { id: '140', name: 'Pending Crypto Receivables', type: 'Assets', isGroup: false },

    // Liabilities
    { id: '200', name: 'Liabilities', type: 'Liabilities', isGroup: true },
    { id: '201', name: 'Client USDT Liability', type: 'Liabilities', isGroup: false },
    { id: '202', name: 'Pending Withdrawals', type: 'Liabilities', isGroup: false },
    { id: '210', name: 'AML-Held Accounts', type: 'Liabilities', isGroup: false },
    { id: '220', name: 'Regulatory Liabilities', type: 'Liabilities', isGroup: false },

    // Equity
    { id: '300', name: 'Equity', type: 'Equity', isGroup: true },
    { id: '301', name: 'Owner’s Equity', type: 'Equity', isGroup: false },
    { id: '302', name: 'Retained Earnings', type: 'Equity', isGroup: false },

    // Income
    { id: '400', name: 'Income', type: 'Income', isGroup: true },
    { id: '401', name: 'Deposit Fees (USD)', type: 'Income', isGroup: false },
    { id: '402', name: 'Withdraw Fees (USD)', type: 'Income', isGroup: false },
    { id: '403', name: 'Exchange Margin Profit', type: 'Income', isGroup: false },

    // Expenses
    { id: '500', name: 'Expenses', type: 'Expenses', isGroup: true },
    { id: '501', name: 'Gas Fees (BNB Network)', type: 'Expenses', isGroup: false },
    { id: '502', name: 'Bank Transfer Fees', type: 'Expenses', isGroup: false },
    { id: '503', name: 'Operations / Admin', type: 'Expenses', isGroup: false },
    { id: '504', name: 'KYC Compliance Costs', type: 'Expenses', isGroup: false },
];


export function ChartOfAccountsTable() {
  const [accounts, setAccounts] = React.useState<Account[]>(initialAccounts);
  const [loading, setLoading] = React.useState(false); // In future, will fetch from DB

  const getBadgeVariant = (type: Account['type']) => {
    switch(type) {
        case 'Assets': return 'default';
        case 'Liabilities': return 'destructive';
        case 'Equity': return 'outline';
        case 'Income': return 'default'; // Should be a different color, e.g., green
        case 'Expenses': return 'secondary';
        default: return 'secondary';
    }
  }

  return (
    <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  Loading accounts...
                </TableCell>
              </TableRow>
            ) : accounts.length > 0 ? (
              accounts.map(account => (
                <TableRow key={account.id} className={cn(account.isGroup && 'bg-muted/50')}>
                  <TableCell className={cn('font-medium', account.isGroup && 'font-bold')}>{account.id}</TableCell>
                  <TableCell className={cn('font-medium', !account.isGroup && 'pl-8', account.isGroup && 'font-bold' )}>{account.name}</TableCell>
                  <TableCell>
                      <Badge variant={getBadgeVariant(account.type)}>{account.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                      {account.isGroup ? '' : '$0.00'}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No accounts found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
