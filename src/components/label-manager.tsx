

'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Save, Trash2, Palette } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { createLabel, deleteLabel } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { TransactionFlag } from '@/lib/types';
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
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Label</>}
        </Button>
    );
}

const colors = [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#eab308', // yellow-500
    '#84cc16', // lime-500
    '#22c55e', // green-500
    '#14b8a6', // teal-500
    '#06b6d4', // cyan-500
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#d946ef', // fuchsia-500
    '#ec4899', // pink-500
    '#64748b', // slate-500
];

export function LabelManager({ initialLabels }: { initialLabels: TransactionFlag[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [labels, setLabels] = React.useState<TransactionFlag[]>(initialLabels);
    const [itemToDelete, setItemToDelete] = React.useState<TransactionFlag | null>(null);
    const [selectedColor, setSelectedColor] = React.useState<string>(colors[0]);

    React.useEffect(() => {
        setLabels(initialLabels);
    }, [initialLabels]);
    
    const handleAddSubmit = async (formData: FormData) => {
        formData.append('color', selectedColor);
        const result = await createLabel(formData);
        if (result?.message) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: 'Label saved.' });
            formRef.current?.reset();
        }
    };

    const handleDeleteClick = (item: TransactionFlag) => {
        setItemToDelete(item);
    };

    const handleDeleteConfirm = async () => {
        if (itemToDelete) {
            const result = await deleteLabel(itemToDelete.id);
            if (result?.message) {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            } else {
                toast({ title: 'Success', description: 'Label deleted.' });
            }
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <form action={handleAddSubmit} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Add New Label</CardTitle>
                        <CardDescription>Create a custom label to categorize clients or transactions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Label Name</Label>
                                <Input id="name" name="name" placeholder="e.g., High Risk" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Color</Label>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    {colors.map(color => (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setSelectedColor(color)}
                                            className={`h-8 w-8 rounded-full border-2 transition-transform duration-150 ${selectedColor === color ? 'border-primary scale-110' : 'border-transparent'}`}
                                            style={{ backgroundColor: color }}
                                        >
                                            <span className="sr-only">{color}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="description">Description (Optional)</Label>
                            <Input id="description" name="description" placeholder="Describe when to use this label" />
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <AddButton />
                    </CardFooter>
                </form>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Existing Labels</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Preview</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {labels.length > 0 ? (
                                    labels.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <span className="px-3 py-1 text-sm font-semibold rounded-full" style={{ backgroundColor: item.color, color: '#fff' }}>
                                                    {item.name}
                                                </span>
                                            </TableCell>
                                            <TableCell>{item.description || 'N/A'}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={3} className="h-24 text-center">No labels created yet.</TableCell></TableRow>
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
                            This will permanently delete the label "{itemToDelete?.name}". This action cannot be undone.
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
