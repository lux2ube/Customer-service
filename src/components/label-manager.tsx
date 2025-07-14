
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { PlusCircle, Save, Trash2 } from 'lucide-react';
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

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : <><Save className="mr-2 h-4 w-4" />Save Label</>}
        </Button>
    );
}

export function LabelManager({ initialLabels }: { initialLabels: TransactionFlag[] }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [labels, setLabels] = React.useState<TransactionFlag[]>(initialLabels);
    const [itemToDelete, setItemToDelete] = React.useState<TransactionFlag | null>(null);

    // This effect ensures the client-side state is updated when initialLabels change (e.g., after form submission and revalidation)
    React.useEffect(() => {
        setLabels(initialLabels);
    }, [initialLabels]);

    const handleFormSubmit = async (formData: FormData) => {
        const result = await createLabel(formData);
        if (result?.message) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        } else {
            toast({ title: 'Success', description: 'Label saved successfully.' });
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
                toast({ title: 'Success', description: 'Label removed successfully.' });
            }
            setItemToDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <form action={handleFormSubmit} ref={formRef}>
                    <CardHeader>
                        <CardTitle>Add New Label</CardTitle>
                        <CardDescription>Create a new label with a custom name and color.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Label Name</Label>
                            <Input id="name" name="name" placeholder="e.g., High Risk" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="color">Color Code</Label>
                            <div className="flex items-center gap-2">
                                <Input id="color" name="color" type="color" className="p-1 h-10 w-14" defaultValue="#cccccc" />
                                <Input name="color-text" placeholder="#cccccc" onChange={(e) => {
                                    const colorInput = formRef.current?.querySelector('input[type="color"]') as HTMLInputElement;
                                    if(colorInput) colorInput.value = e.target.value;
                                }} className="font-mono" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <SubmitButton />
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
                                    <TableHead>Name</TableHead>
                                    <TableHead>Color Code</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {labels.length > 0 ? (
                                    labels.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-2 rounded-full border py-1 px-3 text-sm" style={{ backgroundColor: `${item.color}20`}}>
                                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                                                    <span>{item.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell className="font-mono">{item.color}</TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(item)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No custom labels created yet.</TableCell></TableRow>
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
                            This will permanently remove the "{itemToDelete?.name}" label from the system and from any clients or transactions it's assigned to.
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
