
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
import type { Client, Transaction, Account } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizeArabic, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';


interface ClientsTableProps {
    initialClients: Client[];
    initialTransactions: Transaction[];
    initialBankAccounts: Account[];
    initialCryptoWallets: Account[];
}

const ITEMS_PER_PAGE = 50;

export function ClientsTable({ 
    initialClients,
    initialTransactions,
    initialBankAccounts,
    initialCryptoWallets,
}: ClientsTableProps) {
  const [clients, setClients] = React.useState<Client[]>(initialClients);
  const [transactions, setTransactions] = React.useState<Transaction[]>(initialTransactions);
  const [bankAccounts, setBankAccounts] = React.useState<Account[]>(initialBankAccounts);
  const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>(initialCryptoWallets);
  const [loading, setLoading] = React.useState(false); // Initial load is done on server
  
  const [search, setSearch] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [bankAccountFilter, setBankAccountFilter] = React.useState('all');
  const [cryptoWalletFilter, setCryptoWalletFilter] = React.useState('all');

  // Listen for real-time updates
  React.useEffect(() => {
    const clientsRef = ref(db, 'clients/');
    const transactionsRef = ref(db, 'transactions/');
    const accountsRef = ref(db, 'accounts/');
    
    const unsubs: (()=>void)[] = [];

    unsubs.push(onValue(clientsRef, (snapshot) => {
        const data = snapshot.val();
        setClients(data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : []);
    }));
    
    unsubs.push(onValue(transactionsRef, (snapshot) => {
        const data = snapshot.val();
        setTransactions(data ? Object.values(data) : []);
    }));
    
    unsubs.push(onValue(accountsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            const allAccounts: Account[] = Object.values(data);
            setBankAccounts(allAccounts.filter(acc => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
            setCryptoWallets(allAccounts.filter(acc => !acc.isGroup && acc.currency === 'USDT'));
        }
    }));

    return () => unsubs.forEach(unsub => unsub());
}, []);

  const getClientPhoneString = (phone: string | string[] | undefined): string => {
    if (!phone) return '';
    if (Array.isArray(phone)) return phone.join(' ');
    return phone;
  };
  
  const clientTransactionMap = React.useMemo(() => {
    const map = new Map<string, { bankAccountIds: Set<string>; cryptoWalletIds: Set<string> }>();
    transactions.forEach(tx => {
        if (!tx.clientId) return;
        if (!map.has(tx.clientId)) {
            map.set(tx.clientId, { bankAccountIds: new Set(), cryptoWalletIds: new Set() });
        }
        const clientEntry = map.get(tx.clientId)!;
        if (tx.bankAccountId) clientEntry.bankAccountIds.add(tx.bankAccountId);
        if (tx.cryptoWalletId) clientEntry.cryptoWalletIds.add(tx.cryptoWalletId);
    });
    return map;
  }, [transactions]);


  const filteredClients = React.useMemo(() => {
    let filtered = [...clients].sort((a,b) => {
        const idA = parseInt(a.id);
        const idB = parseInt(b.id);
        if (!isNaN(idA) && !isNaN(idB)) return idB - idA;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    if (search) {
        const normalizedSearch = normalizeArabic(search.toLowerCase().trim());
        const searchTerms = normalizedSearch.split(' ').filter(Boolean);

        filtered = filtered.filter(client => {
            const name = normalizeArabic(client.name?.toLowerCase() || '');
            const phone = (getClientPhoneString(client.phone).toLowerCase());
            const id = (client.id?.toLowerCase() || '');

            // ID and Phone can be a direct substring match. Use original search for phone.
            if (id.includes(normalizedSearch) || phone.includes(search.trim())) {
                return true;
            }
            
            // For name, check if all search terms match the start of some word in the name
            const nameWords = name.split(' ');
            return searchTerms.every(term => 
                nameWords.some(nameWord => nameWord.startsWith(term))
            );
        });
    }

    if (bankAccountFilter !== 'all') {
        filtered = filtered.filter(client => 
            clientTransactionMap.get(client.id)?.bankAccountIds.has(bankAccountFilter)
        );
    }
    
    if (cryptoWalletFilter !== 'all') {
        filtered = filtered.filter(client => 
            clientTransactionMap.get(client.id)?.cryptoWalletIds.has(cryptoWalletFilter)
        );
    }

    return filtered;
  }, [clients, search, bankAccountFilter, cryptoWalletFilter, clientTransactionMap]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, bankAccountFilter, cryptoWalletFilter]);

  const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);

  const paginatedClients = React.useMemo(() => {
      return filteredClients.slice(
          (currentPage - 1) * ITEMS_PER_PAGE,
          currentPage * ITEMS_PER_PAGE
      );
  }, [filteredClients, currentPage]);


  const getStatusVariant = (status: Client['verification_status']) => {
    switch(status) {
        case 'Active': return 'default';
        case 'Inactive': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }

  const clearFilters = () => {
    setSearch('');
    setBankAccountFilter('all');
    setCryptoWalletFilter('all');
  }

  return (
    <>
      <div className="flex items-center py-4 flex-wrap gap-2">
        <Input
          placeholder="Search by name, phone, or ID..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <Select value={bankAccountFilter} onValueChange={setBankAccountFilter}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filter by bank account..." /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Bank Accounts</SelectItem>
                {bankAccounts.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
            </SelectContent>
        </Select>
        <Select value={cryptoWalletFilter} onValueChange={setCryptoWalletFilter}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue placeholder="Filter by crypto wallet..." /></SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All Crypto Wallets</SelectItem>
                {cryptoWallets.map(acc => <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>)}
            </SelectContent>
        </Select>
        <Button variant="ghost" onClick={clearFilters}>
            <X className="mr-2 h-4 w-4" />
            Clear Filters
        </Button>
      </div>
      <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : paginatedClients.length > 0 ? (
                paginatedClients.map(client => {
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(client.verification_status)}>
                          {client.verification_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {client.createdAt && !isNaN(new Date(client.createdAt).getTime())
                          ? format(new Date(client.createdAt), 'PPP')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="icon">
                            <Link href={`/clients/${client.id}/edit`}>
                                <Pencil className="h-4 w-4" />
                            </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No clients found for the selected criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between py-4">
            <div className="text-sm text-muted-foreground">
                Page {totalPages > 0 ? currentPage : 0} of {totalPages}
            </div>
            <div className="flex items-center space-x-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || totalPages === 0}>
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || totalPages === 0}>
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0}>
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0}>
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight className="h-4 w-4" />
                </Button>
            </div>
        </div>
      </>
  );
}
