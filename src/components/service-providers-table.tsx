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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ServiceProvider, Account } from '@/lib/types';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from './ui/button';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteServiceProvider } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { onValue, ref } from 'firebase/database';

export function ServiceProvidersTable({ initialProviders, allAccounts }: { initialProviders: ServiceProvider[], allAccounts: Account[] }) {
    const [providers, setProviders] = React.useState<ServiceProvider[]>(initialProviders);
    const [itemToDelete, setItemToDelete] = React.useState<ServiceProvider | null>(null);
    const { toast } = useToast();

    React.useEffect(() => {
        const providersRef = ref(db, 'service_providers');
        const unsubscribe = onValue(providersRef, (snapshot) => {
            const data = snapshot.val();
            const list: ServiceProvider[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setProviders(list);
        });
        return () => unsubscribe();
    }, []);

    const handleDelete = async () => {
        if (!itemToDelete) return;
        const result = await deleteServiceProvider(itemToDelete.id);
        if (result?.success) {
            toast({ title: 'Success', description: `Provider "${itemToDelete.name}" deleted.` });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setItemToDelete(null);
    };

    const getAccountName = (id: string) => {
        return allAccounts.find(acc => acc.id === id)?.name || id;
    };

    return (
        <>
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Provider Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Linked Accounts</TableHead>
                            <TableHead>Created At</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {providers.length > 0 ? (
                            providers.map((provider) => (
                                <TableRow key={provider.id}>
                                    <TableCell className="font-medium">{provider.name}</TableCell>
                                    <TableCell>
                                        <Badge variant={provider.type === 'Bank' ? 'secondary' : 'default'}>
                                            {provider.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {provider.accountIds.slice(0, 3).map(id => (
                                                <Badge key={id} variant="outline" className="font-normal">{getAccountName(id)}</Badge>
                                            ))}
                                            {provider.accountIds.length > 3 && (
                                                <Badge variant="outline">+{provider.accountIds.length - 3} more</Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>{format(new Date(provider.createdAt), 'PPP')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button asChild variant="ghost" size="icon">
                                            <Link href={`/service-providers/${provider.id}/edit`}>
                                                <Pencil className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => setItemToDelete(provider)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No service providers found. Add one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the provider group "{itemToDelete?.name}". This does not delete the accounts from the Chart of Accounts.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
