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
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil } from 'lucide-react';

export function ClientsTable() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const clientsRef = ref(db, 'clients/');
    const unsubscribe = onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list: Client[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setClients(list);
      } else {
        setClients([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusVariant = (status: Client['verification_status']) => {
    switch(status) {
        case 'Active': return 'default';
        case 'Inactive': return 'destructive';
        case 'Pending': return 'secondary';
        default: return 'secondary';
    }
  }

  return (
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
            ) : clients.length > 0 ? (
              clients.map(client => (
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
                  <TableCell>{format(new Date(client.createdAt), 'PPP')}</TableCell>
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
                  No clients found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
  );
}
