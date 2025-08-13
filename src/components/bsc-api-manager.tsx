
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Save, Trash2, DatabaseZap } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { createBscApiSetting, deleteBscApiSetting, migrateExistingBscApi } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { BscApiSetting, Account } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Setting</>}
        </Button>
    );
}

function MigrateButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Migrating...' : <><DatabaseZap className="mr-2 h-4 w-4" />Migrate Old Setting</>}
        </Button>
    );
}

export function BscApiManager({ initialSettings, usdtAccounts }: { initialSettings: BscApiSetting[], usdtAccounts: Account[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [settings, setSettings] = React.useState<BscApiSetting[]>(initialSettings);
    const [itemToDelete, setItemToDelete] = React.useState<BscApiSetting | null>(null);

    React.useEffect(() => {
        const settingsRef = ref(db, 'bsc_apis/');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            const data = snapshot.val();
            const list: BscApiSetting[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setSettings(list);
        });

        return () => unsubscribe();
    }, []);

    const handleAddSubmit = async (formData: FormData) => {
        const result = await createBscApiSetting(formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: 'BSC API setting saved.' });
            formRef.current?.reset();
        }
    };
    
     const handleMigrate = async (formData: FormData) => {
        const result = await migrateExistingBscApi(formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: result.message });
        }
    };

    const handleDeleteClick = (item: BscApiSetting) => {
        setItemToDelete(item);
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const result = await deleteBscApiSetting(itemToDelete.id);
            if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success', description: 'Setting deleted.' });
            }
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <form action={handleAddSubmit} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Add New BSC API Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Configuration Name</Label>
                            <Input id="name" name="name" placeholder="e.g., Main Binance Wallet" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="accountId">Linked Account</Label>
                             <Select name="accountId" required>
                                <SelectTrigger><SelectValue placeholder="Select a USDT account..."/></SelectTrigger>
                                <SelectContent>
                                    {usdtAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.id})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="walletAddress">Wallet Address</Label>
                            <Input id="walletAddress" name="walletAddress" placeholder="0x..." required />
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="apiKey">BSCScan API Key</Label>
                            <Input id="apiKey" name="apiKey" type="password" required />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <SubmitButton />
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Existing API Configurations</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Wallet Address</TableHead>
                                    <TableHead>Last Synced Block</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {settings.length > 0 ? (
                                    settings.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell className="font-medium">{item.name}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.walletAddress}</TableCell>
                                            <TableCell className="font-mono text-xs">{item.lastSyncedBlock || 'Not synced'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No BSC API configurations found.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
                <CardFooter>
                     <form action={handleMigrate}>
                        <MigrateButton />
                    </form>
                </CardFooter>
            </Card>

            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the API configuration "{itemToDelete?.name}".
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
