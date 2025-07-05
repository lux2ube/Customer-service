'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { importClients, type ImportState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? 'Importing...' : 'Upload and Import'}
        </Button>
    );
}

export function ImportClientsButton() {
    const [open, setOpen] = React.useState(false);
    const formRef = React.useRef<HTMLFormElement>(null);
    const { toast } = useToast();
    const [state, formAction] = useActionState<ImportState, FormData>(importClients, undefined);

    React.useEffect(() => {
        if (state?.message) {
            toast({
                title: state.error ? 'Import Failed' : 'Import Complete',
                description: state.message,
                variant: state.error ? 'destructive' : 'default',
            });
            if (!state.error) {
                setOpen(false);
            }
        }
    }, [state, toast]);

    return (
        <>
            <Button variant="outline" onClick={() => setOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import Clients
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Clients from JSON</DialogTitle>
                        <DialogDescription>
                            Upload a JSON file with client data. The file should be an array of client objects.
                        </DialogDescription>
                    </DialogHeader>
                    <form ref={formRef} action={formAction}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="jsonFile" className="text-right">
                                    JSON File
                                </Label>
                                <Input
                                    id="jsonFile"
                                    name="jsonFile"
                                    type="file"
                                    accept=".json"
                                    className="col-span-3"
                                    required
                                />
                            </div>
                        </div>
                        <DialogFooter>
                             <DialogClose asChild>
                                <Button type="button" variant="secondary">
                                Cancel
                                </Button>
                            </DialogClose>
                            <SubmitButton />
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
