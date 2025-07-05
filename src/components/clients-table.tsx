
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
import type { Client } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ClientsTableProps {
    clients: Client[];
    loading: boolean;
    onFilteredDataChange: (data: Client[]) => void;
}

export function ClientsTable({ clients, loading, onFilteredDataChange }: ClientsTableProps) {
  const [search, setSearch] = React.useState('');

  const filteredClients = React.useMemo(() => {
    let filtered = [...clients];
    if (search) {
        const lowercasedSearch = search.toLowerCase();
        filtered = filtered.filter(client => 
            (client.name?.toLowerCase() || '').includes(lowercasedSearch) ||
            (client.phone?.toLowerCase() || '').includes(lowercasedSearch) ||
            (client.id?.toLowerCase() || '').includes(lowercasedSearch)
        );
    }
    return filtered;
  }, [clients, search]);

  React.useEffect(() => {
    onFilteredDataChange(filteredClients);
  }, [filteredClients, onFilteredDataChange]);


  const getStatusVariant = (status: Client['verification_status']) => {
    switch(status) {
        case 'Active': return 'default';
        case 'Inactive': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }

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
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : filteredClients.length > 0 ? (
                filteredClients.map(client => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>{client.phone}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(client.verification_status)}>
                        {client.verification_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-1">
                      {client.review_flags?.filter(f => f !== 'None').map(flag => (
                        <Badge key={flag} variant="outline">{flag}</Badge>
                      ))}
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
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No clients found for the selected criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </>
  );
}
