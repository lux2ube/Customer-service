
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, PlusCircle, Trash2, Bot, Settings as SettingsIcon, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Account, SmsEndpoint } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHeader,
  TableHead,
} from '@/components/ui/table';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { useActionState } from 'react';
import { createSmsEndpoint, deleteSmsEndpoint, type SmsEndpointState } from '@/lib/actions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
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
import Link from 'next/link';

function EndpointDialogButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending}>
            {pending ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Endpoint')}
        </Button>
    );
}

const nameMatchingRules = [
    { id: 'phone_number', label: 'Phone Number' },
    { id: 'first_and_second', label: 'First & Second Name' },
    { id: 'first_and_last', label: 'First & Last Name' },
    { id: 'full_name', label: 'Full Name (Exact Match)' },
    { id: 'part_of_full_name', label: 'Part of Full Name' },
];

function AddEditEndpointDialog({ accounts, open, setOpen, endpointToEdit }: { accounts: Account[], open: boolean, setOpen: (open: boolean) => void, endpointToEdit?: SmsEndpoint | null }) {
    const { toast } = useToast();
    const formRef = React.useRef<HTMLFormElement>(null);
    
    const [selectedRules, setSelectedRules] = React.useState<string[]>([]);
    
    React.useEffect(() => {
        if (endpointToEdit) {
            setSelectedRules(endpointToEdit.nameMatchingRules || []);
        } else {
            setSelectedRules([]);
        }
    }, [endpointToEdit]);

    const handleRuleChange = (ruleId: string, checked: boolean) => {
        // Defer state update slightly to avoid flushSync error inside dialog
        setTimeout(() => {
            setSelectedRules(prev => {
                if (checked) {
                    return [...prev, ruleId];
                } else {
                    return prev.filter(id => id !== ruleId);
                }
            });
        }, 0);
    };
    
    const [state, formAction] = useActionState<SmsEndpointState, FormData>(createSmsEndpoint, undefined);

    React.useEffect(() => {
        if (!state) return;
        toast({
            title: state.error ? 'Error' : 'Success',
            description: state.message,
            variant: state.error ? 'destructive' : 'default',
        });
        if (!state.error) {
            setOpen(false);
        }
    }, [state, toast, setOpen]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{endpointToEdit ? 'Edit' : 'Create New'} SMS Endpoint</DialogTitle>
                    <DialogDescription>
                        Select an account and define the name matching rules for this SMS provider.
                    </DialogDescription>
                </DialogHeader>
                <form action={formAction} ref={formRef}>
                    <input type="hidden" name="endpointId" value={endpointToEdit?.id || ''} />
                    <div className="py-4 space-y-4">
                        <div>
                            <Label htmlFor="accountId">Account</Label>
                            <Select name="accountId" required defaultValue={endpointToEdit?.accountId}>
                                <SelectTrigger><SelectValue placeholder="Select an account..." /></SelectTrigger>
                                <SelectContent>
                                    {accounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id}>
                                            {acc.name} ({acc.currency})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                             <Label>Name Matching Rules</Label>
                             <Card className="p-4 mt-2 bg-muted/50">
                                 <div className="grid grid-cols-2 gap-4">
                                     {nameMatchingRules.map(rule => (
                                         <div key={rule.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={rule.id}
                                                name="nameMatchingRules"
                                                value={rule.id}
                                                checked={selectedRules.includes(rule.id)}
                                                onCheckedChange={(checked) => handleRuleChange(rule.id, !!checked)}
                                            />
                                            <Label htmlFor={rule.id} className="font-normal">{rule.label}</Label>
                                         </div>
                                     ))}
                                 </div>
                             </Card>
                             <p className="text-xs text-muted-foreground mt-2">Select all formats this provider might use to identify a client in an SMS.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">Cancel</Button>
                        </DialogClose>
                        <EndpointDialogButton isEditing={!!endpointToEdit} />
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


export default function SmsGatewaySetupPage() {
    const [endpoints, setEndpoints] = React.useState<SmsEndpoint[]>([]);
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [endpointToDelete, setEndpointToDelete] = React.useState<SmsEndpoint | null>(null);
    const [endpointToEdit, setEndpointToEdit] = React.useState<SmsEndpoint | null>(null);

    const { toast } = useToast();
    const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

    React.useEffect(() => {
        const endpointsRef = ref(db, 'sms_endpoints/');
        const accountsRef = ref(db, 'accounts/');

        const unsubEndpoints = onValue(endpointsRef, (snapshot) => {
            const data = snapshot.val();
            const list: SmsEndpoint[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setEndpoints(list);
            setLoading(false);
        });

        const unsubAccounts = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            const list: Account[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setAccounts(list.filter(acc => !acc.isGroup && acc.currency));
        });

        return () => {
            unsubEndpoints();
            unsubAccounts();
        };
    }, []);

    const handleDelete = async () => {
        if (!endpointToDelete) return;
        const result = await deleteSmsEndpoint(endpointToDelete.id);
        toast({
            title: result.error ? 'Error' : 'Success',
            description: result.message,
            variant: result.error ? 'destructive' : 'default',
        });
        setEndpointToDelete(null);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: "URL Copied",
            description: "The endpoint URL has been copied to your clipboard.",
        });
    };
    
    const handleOpenDialog = (endpoint: SmsEndpoint | null = null) => {
        setEndpointToEdit(endpoint);
        setDialogOpen(true);
    }

    if (!databaseURL) {
        return (
            <>
                <PageHeader title="SMS Gateway Setup" description="Configure your SMS gateway to post messages." />
                <Card><CardContent className="p-6">The `NEXT_PUBLIC_FIREBASE_DATABASE_URL` environment variable is not set.</CardContent></Card>
            </>
        );
    }
    
    const sanitizedDbUrl = databaseURL.endsWith('/') ? databaseURL.slice(0, -1) : databaseURL;

    return (
        <>
            <PageHeader
                title="SMS Gateway Setup"
                description="Create and manage unique endpoints for your SMS providers."
            >
                <Button onClick={() => handleOpenDialog()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Endpoint
                </Button>
            </PageHeader>
            <AddEditEndpointDialog accounts={accounts} open={dialogOpen} setOpen={setDialogOpen} endpointToEdit={endpointToEdit} />

             <Card>
                <CardHeader className="flex-row items-center gap-4 space-y-0">
                    <div className="p-3 bg-primary/10 rounded-full">
                        <Bot className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                        <CardTitle>Hybrid Parsing System</CardTitle>
                        <CardDescription>
                            This system uses a reliable Regex parser for known SMS formats. For new, unknown formats, it intelligently falls back to an AI parser.
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                     <p className="text-sm text-muted-foreground">
                        To enable the AI fallback for new message formats, please ensure your Gemini API key is set in the main settings.
                    </p>
                    <Button asChild variant="link" className="p-0 h-auto mt-2">
                        <Link href="/settings">
                            Go to Settings <SettingsIcon className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </CardContent>
             </Card>

            <Card className="mt-6">
                <CardHeader>
                    <CardTitle>Active Endpoints</CardTitle>
                    <CardDescription>
                         Configure your SMS gateway to `POST` the raw SMS body as a JSON payload to these unique URLs.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Account</TableHead>
                                    <TableHead>POST URL</TableHead>
                                    <TableHead>Created At</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">Loading endpoints...</TableCell></TableRow>
                                ) : endpoints.length > 0 ? (
                                    endpoints.map(endpoint => {
                                        const endpointUrl = `${sanitizedDbUrl}/incoming/${endpoint.id}.json`;
                                        return (
                                            <TableRow key={endpoint.id}>
                                                <TableCell className="font-medium">{endpoint.accountName}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center space-x-2">
                                                        <Input value={endpointUrl} readOnly className="h-8 font-mono" />
                                                        <Button variant="outline" size="icon" onClick={() => handleCopy(endpointUrl)}>
                                                            <Copy className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{format(new Date(endpoint.createdAt), 'PPP')}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(endpoint)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => setEndpointToDelete(endpoint)}>
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                ) : (
                                    <TableRow><TableCell colSpan={4} className="h-24 text-center">No endpoints created yet.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!endpointToDelete} onOpenChange={(open) => !open && setEndpointToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently delete the endpoint. Any gateway using this URL will fail.</AlertDialogDescription>
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
