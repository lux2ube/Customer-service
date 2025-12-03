'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, JournalEntry } from '@/lib/types';
import { searchClients } from '@/lib/actions/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DetailedEntry {
  journalId: string;
  date: string;
  description: string;
  debitAccount: string;
  debitAccountName: string;
  creditAccount: string;
  creditAccountName: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isDebit: boolean;
}

export function ClientBalanceDetailReport() {
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [entries, setEntries] = React.useState<DetailedEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!selectedClient) {
      setEntries([]);
      return;
    }

    const loadEntries = async () => {
      setLoading(true);
      try {
        const clientAccountId = `6000${selectedClient.id}`;
        const journalRef = ref(db, 'journal_entries');
        const journalSnapshot = await get(journalRef);
        const allEntries: DetailedEntry[] = [];

        if (journalSnapshot.exists()) {
          Object.entries(journalSnapshot.val()).forEach(([journalId, entry]: any) => {
            const isDebit = entry.debit_account === clientAccountId;
            const isCredit = entry.credit_account === clientAccountId;
            
            if (isDebit || isCredit) {
              allEntries.push({
                journalId,
                date: entry.date,
                description: entry.description || '',
                debitAccount: entry.debit_account,
                debitAccountName: entry.debit_account_name || entry.debit_account,
                creditAccount: entry.credit_account,
                creditAccountName: entry.credit_account_name || entry.credit_account,
                amount: entry.amount_usd || entry.debit_amount || 0,
                balanceBefore: isDebit 
                  ? (entry.debit_account_balance_before ?? 0) 
                  : (entry.credit_account_balance_before ?? 0),
                balanceAfter: isDebit
                  ? (entry.debit_account_balance_after ?? 0)
                  : (entry.credit_account_balance_after ?? 0),
                isDebit,
              });
            }
          });
        }

        allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Always calculate running balance from entries for consistency
        // Project convention: stored balance = debits - credits for ALL accounts
        // For client liability accounts (6000x):
        //   - DEBIT increases balance (money owed to client increases - they gave us money)
        //   - CREDIT decreases balance (money paid to client - we gave them money)
        let runningBalance = 0;
        for (const entry of allEntries) {
          entry.balanceBefore = runningBalance;
          if (entry.isDebit) {
            entry.balanceAfter = runningBalance + entry.amount;
          } else {
            entry.balanceAfter = runningBalance - entry.amount;
          }
          runningBalance = entry.balanceAfter;
        }
        
        setEntries(allEntries);
      } catch (error) {
        console.error('Error loading entries:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [selectedClient]);

  const finalBalance = entries.length > 0 ? entries[entries.length - 1].balanceAfter : 0;

  const formatCurrency = (value: number) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Balance Detail Report</CardTitle>
          <CardDescription>
            Select a client to view all their journal entries with running balance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Client</label>
            <ClientSelector 
              selectedClient={selectedClient} 
              onSelect={setSelectedClient} 
            />
          </div>

          {selectedClient && !loading && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Client Account</div>
                <div className="text-lg font-semibold">{selectedClient.name}</div>
                <div className="text-xs text-muted-foreground font-mono">6000{selectedClient.id}</div>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="text-sm text-muted-foreground">Current Balance</div>
                <div className={cn(
                  "text-2xl font-bold",
                  finalBalance >= 0 ? "text-primary" : "text-destructive"
                )}>
                  ${formatCurrency(finalBalance)}
                </div>
                <div className="text-xs text-muted-foreground">{entries.length} journal entries</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      )}

      {!loading && selectedClient && entries.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center py-8">
              No journal entries found for {selectedClient.name}
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && selectedClient && entries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Journal Entries</CardTitle>
            <CardDescription>All transactions affecting {selectedClient.name}'s balance</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="w-[140px]">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[80px] text-center">Type</TableHead>
                    <TableHead className="w-[110px] text-right">Amount</TableHead>
                    <TableHead className="w-[110px] text-right">Balance Before</TableHead>
                    <TableHead className="w-[110px] text-right">Balance After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => (
                    <TableRow key={entry.journalId} className="hover:bg-muted/30">
                      <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">
                        {formatDate(entry.date)}
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px]">
                        <div className="truncate" title={entry.description}>
                          {entry.description}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {entry.isDebit ? (
                            <span>DR: {entry.debitAccountName} → CR: {entry.creditAccountName}</span>
                          ) : (
                            <span>DR: {entry.debitAccountName} → CR: {entry.creditAccountName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.isDebit ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                            <ArrowUpRight className="h-3 w-3" />
                            DR
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            <ArrowDownLeft className="h-3 w-3" />
                            CR
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        ${formatCurrency(entry.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        ${formatCurrency(entry.balanceBefore)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono text-sm font-semibold",
                        entry.balanceAfter >= entry.balanceBefore ? "text-primary" : "text-destructive"
                      )}>
                        ${formatCurrency(entry.balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClientSelector({ 
  selectedClient, 
  onSelect 
}: { 
  selectedClient: Client | null; 
  onSelect: (client: Client | null) => void; 
}) {
  const [open, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(selectedClient?.name || "");
  const [searchResults, setSearchResults] = React.useState<Client[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const debounceTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setInputValue(selectedClient?.name || '');
  }, [selectedClient]);

  React.useEffect(() => {
    if (inputValue.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsLoading(true);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(async () => {
      const results = await searchClients(inputValue);
      setSearchResults(results);
      setIsLoading(false);
    }, 300);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [inputValue]);

  const handleSelect = (client: Client) => {
    onSelect(client);
    setIsOpen(false);
    setInputValue(client.name);
  };
  
  const getPhone = (phone: string | string[] | undefined) => Array.isArray(phone) ? phone.join(' ') : phone || '';

  return (
    <Popover open={open} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          role="combobox" 
          aria-expanded={open} 
          className="w-full justify-between font-normal h-11"
        >
          {selectedClient ? (
            <div className="flex flex-col items-start">
              <span>{selectedClient.name}</span>
              <span className="text-xs text-muted-foreground">{getPhone(selectedClient.phone)}</span>
            </div>
          ) : (
            "Search for a client..."
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Type client name or phone..." 
            value={inputValue} 
            onValueChange={setInputValue} 
          />
          <CommandList>
            {isLoading && (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Searching...
              </div>
            )}
            {!isLoading && inputValue.length >= 2 && searchResults.length === 0 && (
              <CommandEmpty>No client found.</CommandEmpty>
            )}
            {!isLoading && inputValue.length < 2 && (
              <div className="p-4 text-sm text-center text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}
            <CommandGroup>
              {searchResults.map(client => (
                <CommandItem 
                  key={client.id} 
                  value={`${client.name} ${getPhone(client.phone)}`} 
                  onSelect={() => handleSelect(client)}
                  className="cursor-pointer"
                >
                  <Check className={cn("mr-2 h-4 w-4", selectedClient?.id === client.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="font-medium">{client.name}</span>
                    <span className="text-xs text-muted-foreground">{getPhone(client.phone)}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
