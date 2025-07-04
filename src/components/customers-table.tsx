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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Customer, Label } from '@/lib/types';
import { Search, ListFilter } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CustomersTableProps {
  customers: Customer[];
  labels: Label[];
}

export function CustomersTable({ customers, labels }: CustomersTableProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [labelFilters, setLabelFilters] = React.useState<string[]>([]);
  const router = useRouter();

  const labelMap = React.useMemo(() => {
    return labels.reduce((acc, label) => {
      acc[label.id] = label;
      return acc;
    }, {} as Record<string, Label>);
  }, [labels]);

  const filteredCustomers = React.useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch =
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesLabels =
        labelFilters.length === 0 ||
        labelFilters.every(labelId => customer.labels.includes(labelId));

      return matchesSearch && matchesLabels;
    });
  }, [customers, searchTerm, labelFilters]);
  
  const toggleLabelFilter = (labelId: string) => {
    setLabelFilters(prev =>
      prev.includes(labelId)
        ? prev.filter(id => id !== labelId)
        : [...prev, labelId]
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 pb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <ListFilter className="h-4 w-4" />
              Filter Labels
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Filter by label</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {labels.map(label => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={labelFilters.includes(label.id)}
                onCheckedChange={() => toggleLabelFilter(label.id)}
              >
                {label.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Avatar</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>Last Seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map(customer => (
                <TableRow key={customer.id} onClick={() => router.push(`/customers/${customer.id}`)} className="cursor-pointer">
                  <TableCell>
                    <Avatar>
                      <AvatarImage src={customer.avatarUrl} alt={customer.name} />
                      <AvatarFallback>{customer.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-sm text-muted-foreground">{customer.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {customer.labels.map(labelId => (
                        <Badge key={labelId} variant="secondary" style={{
                           backgroundColor: labelMap[labelId]?.color, 
                           color: '#000'
                        }}>
                          {labelMap[labelId]?.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{new Date(customer.lastSeen).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center">
                  No customers found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
