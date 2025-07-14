
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
import type { Client, TransactionFlag } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizeArabic, cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';

interface ClientsTableProps {
    clients: Client[];
    loading: boolean;
    onFilteredDataChange: (data: Client[]) => void;
}

const ITEMS_PER_PAGE = 50;

export function ClientsTable({ clients, loading, onFilteredDataChange }: ClientsTableProps) {
  const [search, setSearch] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [labels, setLabels] = React.useState<TransactionFlag[]>([]);

  React.useEffect(() => {
    const labelsRef = ref(db, 'labels');
    const unsubscribe = onValue(labelsRef, (snapshot) => {
        setLabels(snapshot.val() ? Object.values(snapshot.val()) : []);
    });
    return () => unsubscribe();
  }, []);

  const getClientPhoneString = (phone: string | string[] | undefined): string => {
    if (!phone) return '';
    if (Array.isArray(phone)) return phone.join(' ');
    return phone;
  };

  const filteredClients = React.useMemo(() => {
    let filtered = [...clients];
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
    return filtered;
  }, [clients, search]);

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

  const labelsMap = React.useMemo(() => {
    return new Map(labels?.map(label => [label.id, label]));
  }, [labels]);

  return (
    <>
      <div className="flex items-center py-4">
        <Input
          placeholder="Search by name, phone, or ID..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-sm"
        />
      </div>
      <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 p-2"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Labels</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : paginatedClients.length > 0 ? (
                paginatedClients.map(client => {
                  const firstLabelId = client.review_flags?.[0];
                  const firstLabel = firstLabelId ? labelsMap.get(firstLabelId) : null;
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="p-2">
                        {firstLabel && <div className="h-4 w-4 rounded-full" style={{ backgroundColor: firstLabel.color }} />}
                      </TableCell>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell>{Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(client.verification_status)}>
                          {client.verification_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-1">
                        {client.review_flags?.map(labelId => {
                            const label = labelsMap.get(labelId);
                            if (!label) return null;
                            return (
                                <div key={label.id} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs" style={{ backgroundColor: `${label.color}20` }}>
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                                    {label.name}
                                </div>
                            );
                        })}
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
                  <TableCell colSpan={7} className="h-24 text-center">
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
