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
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import type { Client } from '@/lib/types';
import { Search, Shield, Flag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

export function ClientsTable() {
  const [allClients, setAllClients] = React.useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();

  React.useEffect(() => {
    const usersRef = ref(db, 'users/');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const clientsList: Client[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setAllClients(clientsList);
      } else {
        setAllClients([]);
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);


  const filteredClients = React.useMemo(() => {
    if (!searchTerm) {
      return allClients;
    }
    return allClients.filter(client =>
        client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (client.phone && client.phone.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [allClients, searchTerm]);

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 pb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full"
            disabled={loading}
          />
        </div>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Avatar</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Verification</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Loading data from Firebase...
                </TableCell>
              </TableRow>
            ) : filteredClients.length > 0 ? (
              filteredClients.map(client => (
                <TableRow key={client.id} onClick={() => router.push(`/clients/${client.id}`)} className="cursor-pointer">
                  <TableCell>
                    <Avatar>
                      <AvatarImage src={client.avatarUrl} alt={client.name} />
                      <AvatarFallback>{client.name ? client.name.charAt(0) : '?'}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{client.name}</div>
                  </TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>
                      <Badge variant={client.verificationStatus === 'Active' ? 'default' : 'secondary'}>
                          <Shield className="mr-1 h-3 w-3" />
                          {client.verificationStatus}
                      </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                        {client.reviewFlags?.aml && <Badge variant="destructive"><Flag className="h-3 w-3" /></Badge>}
                        {client.reviewFlags?.volume && <Badge variant="destructive"><Flag className="h-3 w-3" /></Badge>}
                        {client.reviewFlags?.scam && <Badge variant="destructive"><Flag className="h-3 w-3" /></Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{client.created_at ? format(new Date(client.created_at), 'PPP') : 'N/A'}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No clients found in your database.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
