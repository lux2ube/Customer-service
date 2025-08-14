
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
import type { Client, Account } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, remove } from 'firebase/database';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { Trash2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CashReceiptForm } from './cash-receipt-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useRouter } from 'next/navigation';

interface SmsFailure {
    id: string;
    rawSms: string;
    failedAt: string;
    accountId: string;
    accountName: string;
}

export function SmsParsingFailuresTable() {
    const [failures, setFailures] = React.useState<SmsFailure[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [itemToDelete, setItemToDelete] = React.useState<SmsFailure | null>(null);
    const [itemToCreate, setItemToCreate] = React.useState<SmsFailure | null>(null);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [bankAccounts, setBankAccounts] = React.useState<Account[]>([]);
    const { toast } = useToast();
    const router = useRouter();

    React.useEffect(() => {
        const failuresRef = ref(db, 'sms_parsing_failures/');
        const unsubFailures = onValue(failuresRef, (snapshot) => {
            const data = snapshot.val();
            const list: SmsFailure[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })).sort((a,b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime()) : [];
            setFailures(list);
            setLoading(false);
        });

        const clientsRef = ref(db, 'clients');
        const unsubClients = onValue(clientsRef, (snapshot) => {
            setClients(snapshot.exists() ? Object.values(snapshot.val()) : []);
        });

        const accountsRef = ref(db, 'accounts');
        const unsubAccounts = onValue(accountsRef, (snapshot) => {
            const allAccounts = snapshot.exists() ? Object.values(snapshot.val()) : [];
            setBankAccounts(allAccounts.filter((acc: Account) => !acc.isGroup && acc.currency && acc.currency !== 'USDT'));
        });

        return () => {
            unsubFailures();
            unsubClients();
            unsubAccounts();
        }
    }, []);

    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await remove(ref(db, `sms_parsing_failures/${itemToDelete.id}`));
            toast({ title: 'Success', description: 'Failed SMS entry deleted.' });
            setItemToDelete(null);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete entry.' });
        }
    }

    const handleCreateFromFailure = async () => {
        if (!itemToCreate) return;
        // After manual creation, delete the failure record
        await remove(ref(db, `sms_parsing_failures/${itemToCreate.id}`));
        setItemToCreate(null);
        router.push('/modern-cash-records');
    }

    return (
        <>
        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Failed At</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Raw SMS Content</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading failed messages...</TableCell></TableRow>
                ) : failures.length > 0 ? (
                failures.map((item) => (
                    <TableRow key={item.id}>
                        <TableCell>{format(new Date(item.failedAt), 'Pp')}</TableCell>
                        <TableCell>{item.accountName}</TableCell>
                        <TableCell className="font-mono text-xs" dir="rtl">{item.rawSms}</TableCell>
                        <TableCell className="text-right">
                           <Button variant="outline" size="sm" onClick={() => setItemToCreate(item)} className="mr-2">
                                <Pencil className="mr-2 h-4 w-4" /> Create Manually
                           </Button>
                           <Button variant="ghost" size="icon" onClick={() => setItemToDelete(item)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                           </Button>
                        </TableCell>
                    </TableRow>
                ))
                ) : (
                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No parsing failures found.</TableCell></TableRow>
                )}
            </TableBody>
            </Table>
        </div>

         <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this failed SMS entry. This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
        <Dialog open={!!itemToCreate} onOpenChange={(open) => !open && setItemToCreate(null)}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Create Cash Record from Failed SMS</DialogTitle>
                </DialogHeader>
                 <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md font-mono" dir="rtl">{itemToCreate?.rawSms}</p>
                 <CashReceiptForm clients={clients} bankAccounts={bankAccounts} onFormSubmit={handleCreateFromFailure} />
            </DialogContent>
        </Dialog>

        </>
    );
}
