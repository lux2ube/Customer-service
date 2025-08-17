

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
import type { Client, CashRecord, UsdtRecord, Account } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizeArabic, cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { onValue, ref, get, query, orderByChild, equalTo } from 'firebase/database';


interface ClientsTableProps {
    initialClients: Client[];
    initialTransactions: never[]; // This is no longer needed
    initialBankAccounts: Account[];
    initialCryptoWallets: Account[];
    onFilteredDataChange: (data: Client[]) => void;
}

const ITEMS_PER_PAGE = 50;

export function ClientsTable({ 
    initialClients,
    initialBankAccounts,
    initialCryptoWallets,
    onFilteredDataChange,
}: ClientsTableProps) {
  const [clients, setClients] = React.useState<Client[]>(initialClients);
  const [bankAccounts, setBankAccounts] = React.useState<Account[]>(initialBankAccounts);
  const [cryptoWallets, setCryptoWallets] = React.useState<Account[]>(initialCryptoWallets);
  const [loading, setLoading] = React.useState(true);
  
  const [search, setSearch] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [bankAccountFilter, setBankAccountFilter] = React.useState('all');
  const [cryptoWalletFilter, setCryptoWalletFilter] = React.useState('all');
  
  const [clientRecordMap, setClientRecordMap] = React.useState(new Map<string, { bankAccountIds: Set<string>, cryptoWalletIds: Set<string> }>());

  // Listen for real-time updates
  React.useEffect(() => {
    setLoading(initialClients.length === 0);
     const clientsRef = ref(db, 'clients');
     const unsubscribe = onValue(clientsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            setClients(Object.keys(data).map(key => ({ id: key, ...data[key] })));
        }
        setLoading(false);
    });
    return () => unsubscribe();
  }, [initialClients]);

  React.useEffect(() => {
    const fetchRecords = async () => {
        const newMap = new Map<string, { bankAccountIds: Set<string>, cryptoWalletIds: Set<string> }>();
        const [cashSnapshot, usdtSnapshot] = await Promise.all([
            get(ref(db, 'records/cash')),
            get(ref(db, 'records/usdt'))
        ]);
        
        if (cashSnapshot.exists()) {
            const records: Record<string, CashRecord> = cashSnapshot.val();
            Object.values(records).forEach(rec => {
                if (rec.clientId) {
                    if (!newMap.has(rec.clientId)) newMap.set(rec.clientId, { bankAccountIds: new Set(), cryptoWalletIds: new Set() });
                    newMap.get(rec.clientId)!.bankAccountIds.add(rec.accountId);
                }
            });
        }
        
        if (usdtSnapshot.exists()) {
            const records: Record<string, UsdtRecord> = usdtSnapshot.val();
            Object.values(records).forEach(rec => {
                if (rec.clientId) {
                    if (!newMap.has(rec.clientId)) newMap.set(rec.clientId, { bankAccountIds: new Set(), cryptoWalletIds: new Set() });
                    newMap.get(rec.clientId)!.cryptoWalletIds.add(rec.accountId);
                }
            });
        }
        setClientRecordMap(newMap);
    };
    fetchRecords();
  }, []);

  const getClientPhoneString = (phone: string | string[] | undefined): string => {
    if (!phone) return '';
    if (Array.isArray(phone)) return phone.join(' ');
    return phone;
  };
  
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

            if (id.includes(normalizedSearch) || phone.includes(search.trim())) {
                return true;
            }
            
            const nameWords = name.split(' ');
            return searchTerms.every(term => 
                nameWords.some(nameWord => nameWord.startsWith(term))
            );
        });
    }

    if (bankAccountFilter !== 'all') {
        filtered = filtered.filter(client => {
            const clientData = clientRecordMap.get(client.id);
            return clientData?.bankAccountIds.has(bankAccountFilter);
        });
    }
    
    if (cryptoWalletFilter !== 'all') {
         filtered = filtered.filter(client => {
            const clientData = clientRecordMap.get(client.id);
            return clientData?.cryptoWalletIds.has(cryptoWalletFilter);
        });
    }

    return filtered;
  }, [clients, search, bankAccountFilter, cryptoWalletFilter, clientRecordMap]);

  React.useEffect(() => {
    onFilteredDataChange(filteredClients);
    setCurrentPage(1);
  }, [filteredClients, onFilteredDataChange]);

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
