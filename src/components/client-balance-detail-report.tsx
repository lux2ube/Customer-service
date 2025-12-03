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
import { Check, ChevronsUpDown, ArrowUpRight, ArrowDownLeft, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from './ui/badge';
import { format, parseISO, startOfDay } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { ExportButton } from './export-button';

interface DetailedEntry {
  journalId: string;
  date: string;
  description: string;
  otherAccount: string;
  otherAccountName: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isIncrease: boolean;
}

export function ClientBalanceDetailReport() {
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [entries, setEntries] = React.useState<DetailedEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [periodStartDate, setPeriodStartDate] = React.useState<Date | null>(null);
  const [loadingSettings, setLoadingSettings] = React.useState(true);

  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsRef = ref(db, 'settings/financialPeriodStartDate');
        const snapshot = await get(settingsRef);
        if (snapshot.exists()) {
          setPeriodStartDate(new Date(snapshot.val()));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  React.useEffect(() => {
    if (!selectedClient || loadingSettings) {
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
        const periodStart = periodStartDate ? startOfDay(periodStartDate) : new Date(0);

        if (journalSnapshot.exists()) {
          Object.entries(journalSnapshot.val()).forEach(([journalId, entry]: any) => {
            const entryDate = parseISO(entry.date);
            if (entryDate < periodStart) return;

            const isDebit = entry.debit_account === clientAccountId;
            const isCredit = entry.credit_account === clientAccountId;
            
            if (isDebit || isCredit) {
              const entryAmount = isDebit 
                ? (entry.debit_amount || entry.amount_usd || 0)
                : (entry.credit_amount || entry.amount_usd || 0);
              
              allEntries.push({
                journalId,
                date: entry.date,
                description: entry.description || '',
                otherAccount: isDebit ? entry.credit_account : entry.debit_account,
                otherAccountName: isDebit 
                  ? (entry.credit_account_name || entry.credit_account)
                  : (entry.debit_account_name || entry.debit_account),
                amount: entryAmount,
                balanceBefore: 0,
                balanceAfter: 0,
                isIncrease: isDebit,
              });
            }
          });
        }

        allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        let runningBalance = 0;
        for (const entry of allEntries) {
          entry.balanceBefore = runningBalance;
          if (entry.isIncrease) {
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
  }, [selectedClient, periodStartDate, loadingSettings]);

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

  const exportableData = React.useMemo(() => {
    return entries.map((entry, index) => ({
      index: index + 1,
      date: formatDate(entry.date),
      description: entry.description,
      otherAccount: entry.otherAccountName,
      type: entry.isIncrease ? 'INCREASE' : 'DECREASE',
      amount: entry.amount.toFixed(2),
      balanceBefore: entry.balanceBefore.toFixed(2),
      balanceAfter: entry.balanceAfter.toFixed(2),
    }));
  }, [entries]);

  if (loadingSettings) {
    return <div className="p-4">Loading settings...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Client Balance Detail Report</CardTitle>
              <CardDescription>
                Select a client to view all their transactions with running balance
              </CardDescription>
            </div>
            {periodStartDate && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="gap-1">
                      <Info className="h-3 w-3" />
                      Period: {format(periodStartDate, "MMM dd, yyyy")}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Only showing entries from the current financial period</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2 flex-1 min-w-[250px]">
              <label className="text-sm font-medium">Select Client</label>
              <ClientSelector 
                selectedClient={selectedClient} 
                onSelect={setSelectedClient} 
              />
            </div>
            {selectedClient && entries.length > 0 && (
              <ExportButton 
                data={exportableData}
                filename={`client-balance-detail-${selectedClient.name.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}`}
                headers={{
                  index: "#",
                  date: "Date",
                  description: "Description",
                  otherAccount: "Counter Account",
                  type: "Type",
                  amount: "Amount (USD)",
                  balanceBefore: "Balance Before",
                  balanceAfter: "Balance After",
                }}
              />
            )}
          </div>

          {selectedClient && !loading && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">Client Account</div>
                <div className="text-lg font-semibold">{selectedClient.name}</div>
                <div className="text-xs text-muted-foreground font-mono">6000{selectedClient.id}</div>
              </div>
              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="text-sm text-muted-foreground">Current Balance (We Owe Client)</div>
                <div className={cn(
                  "text-2xl font-bold",
                  finalBalance >= 0 ? "text-primary" : "text-destructive"
                )}>
                  ${formatCurrency(finalBalance)}
                </div>
                <div className="text-xs text-muted-foreground">{entries.length} transactions</div>
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
              No transactions found for {selectedClient.name} in the current period
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && selectedClient && entries.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Transaction History</CardTitle>
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
                    <TableHead className="w-[100px] text-center">Type</TableHead>
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
                          {entry.isIncrease ? 'From' : 'To'}: {entry.otherAccountName}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {entry.isIncrease ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                            <ArrowDownLeft className="h-3 w-3" />
                            INCREASE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                            <ArrowUpRight className="h-3 w-3" />
                            DECREASE
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
