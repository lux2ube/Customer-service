
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Save, Trash2, FileScan, Loader2 } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { addBlacklistItem, deleteBlacklistItem, scanClientsWithBlacklist, type ScanState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { BlacklistItem } from '@/lib/types';
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
} from "@/components/ui/alert-dialog"

function AddButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Adding...' : <><Save className="mr-2 h-4 w-4" />Add to Blacklist</>}
        </Button>
    );
}

function ScanButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" variant="outline" disabled={pending}>
            {pending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning...</>
            ) : (
                <><FileScan className="mr-2 h-4 w-4" />Scan All Clients</>
            )}
        </Button>
    );
}

export function BlacklistManager() {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [blacklist, setBlacklist] = React.useState<BlacklistItem[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [itemToDelete, setItemToDelete] = React.useState<BlacklistItem | null>(null);

    const [scanState, scanAction] = React.useActionState<ScanState, FormData>(scanClientsWithBlacklist, undefined);

    React.useEffect(() => {
        if (scanState?.message) {
            toast({
                title: scanState.error ? 'Scan Failed' : 'Scan Complete',
                description: scanState.message,
                variant: scanState.error ? 'destructive' : 'default',
            });
        }
    }, [scanState, toast]);

    React.useEffect(() => {
        const blacklistRef = ref(db, 'blacklist/');
        const unsubscribe = onValue(blacklistRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const list: BlacklistItem[] = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]
                })).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                setBlacklist(list);
            } else {
                setBlacklist([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);
    
    const handleAddSubmit = async (formData: FormData) => {
        const result = await addBlacklistItem(formData);
        if (result?.message) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: 'Item added to blacklist.' });
            formRef.current?.reset();
        }
    };

    const handleDeleteClick = (item: BlacklistItem) => {
        setItemToDelete(item);
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const result = await deleteBlacklistItem(itemToDelete.id);
            if (result?.message) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success', description: 'Item removed from blacklist.' });
            }
            setDeleteDialogOpen(false);
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <form action={handleAddSubmit} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Add New Blacklist Item</CardTitle>
                        <CardDescription>Enter a value to be flagged. Checks are case-insensitive for names and addresses.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="type">Type</Label>
                            <Select name="type" required>
                                <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Name">Name</SelectItem>
                                    <SelectItem value="Phone">Phone Number</SelectItem>
                                    <SelectItem value="Address">BEP20 Address</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="value">Value</Label>
                            <Input id="value" name="value" placeholder="Enter name, phone, or address..." required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason (Optional)</Label>
                            <Input id="reason" name="reason" placeholder="e.g., Known scammer" />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <AddButton />
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Manual Actions</CardTitle>
                    <CardDescription>
                        Run a manual scan to apply the current blacklist to all existing clients. This is useful after adding new items.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={scanAction}>
                        <ScanButton />
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Current Blacklist</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Value</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead>Added On</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Loading...</TableCell></TableRow>
                                ) : blacklist.length > 0 ? (
                                    blacklist.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.type}</TableCell>
                                            <TableCell className="font-mono">{item.value}</TableCell>
                                            <TableCell>{item.reason || 'N/A'}</TableCell>
                                            <TableCell>{item.createdAt && !isNaN(new Date(item.createdAt).getTime()) ? format(new Date(item.createdAt), 'PPP') : 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={5} className="h-24 text-center">Blacklist is empty.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently remove the item from the blacklist.
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
