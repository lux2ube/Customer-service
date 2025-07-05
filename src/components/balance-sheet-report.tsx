
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, endOfDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Account, JournalEntry, Transaction } from '@/lib/types';
import { Table, TableBody, TableCell, TableRow, TableFooter } from '@/components/ui/table';

interface ReportRow {
    accountId: string;
    accountName: string;
    isGroup: boolean;
    level: number;
    amount: number;
}

interface CalculatedReport {
    assetRows: ReportRow[];
    totalAssets: number;
    liabilityRows: ReportRow[];
    totalLiabilities: number;
    equityRows: ReportRow[];
    totalEquity: number;
}

// Helper function to build the tree structure for hierarchical display
const buildAccountTree = (accounts: Account[]) => {
    const accountMap = new Map(accounts.map(acc => [acc.id, { ...acc, children: [] as Account[] }]));
    const tree: any[] = [];
    accounts.forEach(acc => {
        if (acc.parentId && accountMap.has(acc.parentId)) {
            accountMap.get(acc.parentId)!.children.push(accountMap.get(acc.id) as any);
        } else {
            tree.push(accountMap.get(acc.id)!);
        }
    });
    return tree;
};


export function BalanceSheetReport({ initialAccounts, initialJournalEntries, initialTransactions }: { initialAccounts: Account[], initialJournalEntries: JournalEntry[], initialTransactions: Transaction[] }) {
    const [date, setDate] = React.useState<Date | undefined>(new Date());

    const formatCurrency = (value: number) => {
        // Show negative numbers in parentheses for accounting format
        const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(value));
        return value < 0 ? `(${formatted})` : formatted;
    }
    
    const calculatedData = React.useMemo((): CalculatedReport => {
        const toDate = date ? endOfDay(date) : new Date();

        // 1. Calculate balances for all non-group accounts from journal entries first
        const leafBalances: Record<string, number> = {};
        initialAccounts.forEach(acc => {
            if (!acc.isGroup) leafBalances[acc.id] = 0;
        });

        initialJournalEntries.forEach(entry => {
            const entryDate = parseISO(entry.date);
            if (entryDate <= toDate) {
                if (leafBalances[entry.debit_account] !== undefined) leafBalances[entry.debit_account] += entry.amount_usd;
                if (leafBalances[entry.credit_account] !== undefined) leafBalances[entry.credit_account] -= entry.amount_usd;
            }
        });

        // 2. Adjust asset balances based on transaction principals, which are not journaled.
        // The fee/expense parts ARE journaled, so we subtract them from the transaction amounts here to avoid double-counting.
         initialTransactions.forEach(tx => {
            if (tx.status !== 'Confirmed') return;
            const txDate = parseISO(tx.date);
             if (txDate <= toDate) {
                if (tx.type === 'Deposit') {
                    // Bank account increases by the principal amount (total USD received minus the fee, which is already journaled).
                    if (tx.bankAccountId && leafBalances[tx.bankAccountId] !== undefined) {
                        leafBalances[tx.bankAccountId] += (tx.amount_usd - (tx.fee_usd || 0));
                    }
                    // Crypto wallet decreases by the principal amount (total USDT sent minus the expense, which is already journaled).
                    if (tx.cryptoWalletId && leafBalances[tx.cryptoWalletId] !== undefined) {
                        leafBalances[tx.cryptoWalletId] -= (tx.amount_usdt - (tx.expense_usd || 0));
                    }
                }
                else if (tx.type === 'Withdraw') {
                    // Bank account decreases by the principal amount (total USD sent minus the expense, which is already journaled).
                    if (tx.bankAccountId && leafBalances[tx.bankAccountId] !== undefined) {
                        leafBalances[tx.bankAccountId] -= (tx.amount_usd - (tx.expense_usd || 0));
                    }
                    // Crypto wallet increases by the principal amount (total USDT received minus the fee, which is already journaled).
                    if (tx.cryptoWalletId && leafBalances[tx.cryptoWalletId] !== undefined) {
                        leafBalances[tx.cryptoWalletId] += (tx.amount_usdt - (tx.fee_usd || 0));
                    }
                }
            }
        });

        // 3. Aggregate balances up to parent groups
        const allBalances = { ...leafBalances };
        const accountTree = buildAccountTree(initialAccounts);

        const aggregateBalances = (account: any): number => {
            if (!account.isGroup) return allBalances[account.id] || 0;
            
            const childrenTotal = account.children.reduce((sum: number, child: any) => {
                return sum + aggregateBalances(child);
            }, 0);
            
            allBalances[account.id] = childrenTotal;
            return childrenTotal;
        }
        accountTree.forEach(aggregateBalances);
        
        // 4. Calculate Net Income for the period to add to Equity
        let netIncome = 0;
        const incomeAccountIds = new Set(initialAccounts.filter(a => a.type === 'Income').map(a => a.id));
        const expenseAccountIds = new Set(initialAccounts.filter(a => a.type === 'Expenses').map(a => a.id));
        
        Object.entries(leafBalances).forEach(([accountId, balance]) => {
            // Income accounts have a credit balance (negative in our system). To make it positive revenue, we negate it.
            if (incomeAccountIds.has(accountId)) netIncome -= balance;
            // Expense accounts have a debit balance (positive). To make it a positive expense to subtract, we use it as is.
            if (expenseAccountIds.has(accountId)) netIncome -= balance;
        });

        // 5. Build final report rows
        const buildRows = (type: Account['type']): ReportRow[] => {
            const typeAccounts = initialAccounts.filter(a => a.type === type);
            const typeTree = buildAccountTree(typeAccounts);
            const rows: ReportRow[] = [];
            
            const processNode = (account: any, level: number) => {
                const balance = allBalances[account.id] || 0;
                // Only show accounts with a balance, or group accounts
                if (Math.abs(balance) > 0.001 || account.isGroup) {
                    // For display, Liability and Equity credit balances should be positive
                    const displayAmount = (type === 'Liabilities' || type === 'Equity') ? -balance : balance;
                    rows.push({
                        accountId: account.id,
                        accountName: account.name,
                        isGroup: account.isGroup,
                        level,
                        amount: displayAmount,
                    });
                    account.children.sort((a:any,b:any)=>a.id.localeCompare(b.id)).forEach((child: any) => processNode(child, level + 1));
                }
            }
            typeTree.sort((a,b)=>a.id.localeCompare(b.id)).forEach(node => processNode(node, 0));
            return rows;
        }

        const assetRows = buildRows('Assets');
        const liabilityRows = buildRows('Liabilities');
        let equityRows = buildRows('Equity');

        // Add Net Income to Equity section
        if (Math.abs(netIncome) > 0.001) {
            equityRows.push({ accountId: 'net-income', accountName: 'Retained Earnings (Net Income)', isGroup: false, level: 1, amount: netIncome });
        }
        
        // --- CORRECTED TOTALS CALCULATION ---
        const rootAssetAccounts = initialAccounts.filter(a => a.type === 'Assets' && !a.parentId);
        const totalAssets = rootAssetAccounts.reduce((sum, acc) => sum + (allBalances[acc.id] || 0), 0);
        
        const rootLiabilityAccounts = initialAccounts.filter(a => a.type === 'Liabilities' && !a.parentId);
        const totalLiabilities = -rootLiabilityAccounts.reduce((sum, acc) => sum + (allBalances[acc.id] || 0), 0);

        const rootEquityAccounts = initialAccounts.filter(a => a.type === 'Equity' && !a.parentId);
        const equityBaseTotal = -rootEquityAccounts.reduce((sum, acc) => sum + (allBalances[acc.id] || 0), 0);
        const totalEquity = equityBaseTotal + netIncome;
        
        return { assetRows, totalAssets, liabilityRows, totalLiabilities, equityRows, totalEquity };
    }, [date, initialAccounts, initialJournalEntries, initialTransactions]);

    const totalLiabilitiesAndEquity = calculatedData.totalLiabilities + calculatedData.totalEquity;

    const renderSection = (title: string, rows: ReportRow[], total: number) => (
        <div className="space-y-2">
            <h3 className="text-lg font-semibold mb-2 px-4">{title}</h3>
            <Table>
                <TableBody>
                    {rows.map(row => (
                        <TableRow key={row.accountId} className={cn(row.isGroup && 'bg-muted/50')}>
                            <TableCell style={{ paddingLeft: `${1 + row.level * 1.5}rem` }} className={cn(row.isGroup && 'font-bold')}>{row.accountName}</TableCell>
                            <TableCell className="text-right font-mono">{!row.isGroup ? formatCurrency(row.amount) : ''}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
                <TableFooter>
                    <TableRow className="bg-card-foreground/10 font-bold">
                        <TableCell>Total {title}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(total)}</TableCell>
                    </TableRow>
                </TableFooter>
            </Table>
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-[300px] justify-start text-left font-normal", !date && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? `As of ${format(date, "LLL dd, y")}`: <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar initialFocus mode="single" selected={date} onSelect={setDate} />
                    </PopoverContent>
                </Popover>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Balance Sheet</CardTitle>
                    <p className="text-sm text-muted-foreground">As of {date ? format(date, "MMMM dd, yyyy") : '...'}</p>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                    {renderSection("Assets", calculatedData.assetRows, calculatedData.totalAssets)}
                    <div className="space-y-8">
                        {renderSection("Liabilities", calculatedData.liabilityRows, calculatedData.totalLiabilities)}
                        {renderSection("Equity", calculatedData.equityRows, calculatedData.totalEquity)}
                    </div>
                </CardContent>
                 <CardFooter className="bg-muted/50 p-4 mt-6 grid md:grid-cols-2 gap-8">
                    <div className="flex justify-between w-full items-center font-bold text-lg">
                        <h3>Total Assets</h3>
                        <p className="font-mono">{formatCurrency(calculatedData.totalAssets)}</p>
                    </div>
                    <div className="flex justify-between w-full items-center font-bold text-lg">
                        <h3>Total Liabilities & Equity</h3>
                        <p className={cn("font-mono", Math.abs(calculatedData.totalAssets - totalLiabilitiesAndEquity) > 0.01 && "text-destructive ring-2 ring-destructive rounded-sm p-1")}>
                            {formatCurrency(totalLiabilitiesAndEquity)}
                        </p>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
