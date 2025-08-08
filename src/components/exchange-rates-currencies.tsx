
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useToast } from '@/hooks/use-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from './ui/table';
import { Save, Trash2 } from 'lucide-react';
import type { Currency } from '@/lib/types';
import { addCurrency, deleteCurrency } from '@/lib/actions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';

function AddButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Adding...' : <><Save className="mr-2 h-4 w-4" />Add Currency</>}
        </Button>
    );
}

export function CurrenciesManager({ initialCurrencies }: { initialCurrencies: Currency[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [itemToDelete, setItemToDelete] = React.useState<Currency | null>(null);
    
    const handleAddSubmit = async (formData: FormData) => {
        const result = await addCurrency(undefined, formData);
        if (result?.error) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: 'Currency added.' });
            formRef.current?.reset();
        }
    };

    const handleDeleteClick = (item: Currency) => {
        setItemToDelete(item);
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const result = await deleteCurrency(itemToDelete.code);
            if (result?.error) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success', description: 'Currency deleted.' });
            }
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <form action={handleAddSubmit} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Manage Fiat Currencies</CardTitle>
                        <CardDescription>Add or remove currencies available for exchange rates.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="code">Currency Code</Label>
                                <Input id="code" name="code" placeholder="e.g., YER" required className="uppercase" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Currency Name</Label>
                                <Input id="name" name="name" placeholder="e.g., Yemeni Rial" required />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <AddButton />
                    </CardFooter>
                </form>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Defined Currencies</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {initialCurrencies.length > 0 ? (
                                    initialCurrencies.map(item => (
                                        <TableRow key={item.code}>
                                            <TableCell className="font-mono">{item.code}</TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center">No currencies defined yet.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the currency "{itemToDelete?.name} ({itemToDelete?.code})". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
