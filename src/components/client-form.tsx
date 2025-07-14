
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import React from 'react';
import { createClient, manageClient, type ClientFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import type { Client, Account, Transaction, Settings } from '@/lib/types';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';


export function ClientForm({ client, bankAccounts, transactions, otherClientsWithSameName }: { client?: Client, bankAccounts?: Account[], transactions?: Transaction[], otherClientsWithSameName?: Client[] }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [state, setState] = React.useState<ClientFormState>();
    const [isSaving, setIsSaving] = React.useState(false);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    
    const [formData, setFormData] = React.useState({
        name: client?.name || '',
        phone: client?.phone ? (Array.isArray(client.phone) ? (client.phone.length > 0 ? client.phone : ['']) : [client.phone]) : [''],
        verification_status: client?.verification_status || 'Pending',
        review_flags: client?.review_flags || [],
        prioritize_sms_matching: client?.prioritize_sms_matching || false,
    });
    
    const [filesToUpload, setFilesToUpload] = React.useState<File[]>([]);
    const [previews, setPreviews] = React.useState<string[]>([]);

    const [kycDocuments, setKycDocuments] = React.useState(client?.kyc_documents || []);
    const [bep20Addresses, setBep20Addresses] = React.useState(client?.bep20_addresses || []);
    const [favoriteBankAccount, setFavoriteBankAccount] = React.useState({
        id: client?.favoriteBankAccountId,
        name: client?.favoriteBankAccountName
    });

    const [dialogState, setDialogState] = React.useState<{
        open: boolean;
        title: string;
        description: string;
        intent: string;
    } | null>(null);

    React.useEffect(() => {
        const settingsRef = ref(db, 'settings');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            setSettings(snapshot.val());
        });
        return () => unsubscribe();
    }, []);

    const usedBankAccounts = React.useMemo(() => {
        if (!transactions) return [];
        const accountsMap = new Map<string, { name: string, lastUsed: string }>();
        transactions
            .filter(tx => tx.bankAccountId && tx.bankAccountName)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .forEach(tx => {
                if (!accountsMap.has(tx.bankAccountId!)) {
                    accountsMap.set(tx.bankAccountId!, {
                        name: tx.bankAccountName!,
                        lastUsed: tx.date,
                    });
                }
            });
        return Array.from(accountsMap.entries()).map(([id, data]) => ({ id, ...data }));
    }, [transactions]);

    const cryptoWalletsLastUsed = React.useMemo(() => {
        if (!transactions) return new Map<string, string>();
        const lastUsedMap = new Map<string, string>();
        transactions
            .filter(tx => tx.client_wallet_address)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .forEach(tx => {
                const address = tx.client_wallet_address!.toLowerCase();
                if (!lastUsedMap.has(address)) {
                    lastUsedMap.set(address, tx.date);
                }
            });
        return lastUsedMap;
    }, [transactions]);

    const processFormResult = (result: ClientFormState) => {
        if (result?.success) {
            toast({ title: 'Success', description: result.message });
            if (result.intent?.startsWith('delete:')) {
                const docName = result.intent.split(':')[1];
                setKycDocuments(prev => prev.filter(doc => doc.name !== docName));
            } else if (result.intent?.startsWith('delete_address:')) {
                const address = result.intent.split(':')[1];
                setBep20Addresses(prev => prev.filter(a => a !== address));
            } else if (result.intent?.startsWith('unfavorite_bank_account:')) {
                setFavoriteBankAccount({ id: undefined, name: undefined });
            } else if (result.clientId) {
                router.push(`/clients/${result.clientId}/edit`);
            } else if (!client) {
                router.push('/clients');
            }
        } else if (result?.message) {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
        setState(result);
    };

    const handleSubmit = async (intent: string) => {
        if (!formRef.current) return;
        setIsSaving(true);
        const actionFormData = new FormData(formRef.current);
        actionFormData.set('intent', intent);

        try {
            const result = client
                ? await manageClient(client.id, actionFormData)
                : await createClient(null, actionFormData);
            processFormResult(result);
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSaving(false);
            if (dialogState) setDialogState(null);
        }
    };

    React.useEffect(() => {
        // Revoke the data uris to avoid memory leaks
        return () => previews.forEach(url => URL.revokeObjectURL(url));
    }, [previews]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const selectedFiles = Array.from(e.target.files);
            setFilesToUpload(selectedFiles);
            previews.forEach(url => URL.revokeObjectURL(url));
            const newPreviews = selectedFiles.map(file => URL.createObjectURL(file));
            setPreviews(newPreviews);
        }
    };

    const handleFlagChange = (flagId: string, checked: boolean) => {
        setFormData(prev => {
            const newFlags = checked 
                ? [...prev.review_flags, flagId]
                : prev.review_flags.filter(f => f !== flagId);
            return { ...prev, review_flags: newFlags };
        });
    };
    
    const handlePhoneChange = (index: number, value: string) => {
        const newPhones = [...formData.phone];
        newPhones[index] = value;
        setFormData({ ...formData, phone: newPhones });
    };

    const addPhoneNumber = () => {
        setFormData({ ...formData, phone: [...formData.phone, ''] });
    };

    const removePhoneNumber = (index: number) => {
        if (formData.phone.length > 1) {
            const newPhones = formData.phone.filter((_, i) => i !== index);
            setFormData({ ...formData, phone: newPhones });
        }
    };

    const handleDeleteClick = (intent: string, title: string, description: string) => {
        setDialogState({ open: true, intent, title, description });
    };
    
    const handleDialogCancel = () => {
        setDialogState(null);
    };

    const showPriorityWarning = formData.prioritize_sms_matching && otherClientsWithSameName && otherClientsWithSameName.length > 0;

    return (
        <>
        <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit('save_client'); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1 space-y-4">
                <Card>
                    <CardHeader>
                        <CardTitle>{client ? 'Edit' : 'New'} Client</CardTitle>
                        <CardDescription>Fill in the details for the client profile.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name</Label>
                            <Input 
                                id="name" 
                                name="name" 
                                placeholder="e.g., John M. Doe" 
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                required 
                            />
                            {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Phone Number(s)</Label>
                            {formData.phone.map((phone, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Input
                                        name="phone"
                                        placeholder="e.g., 555-1234"
                                        value={phone}
                                        onChange={(e) => handlePhoneChange(index, e.target.value)}
                                        required
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removePhoneNumber(index)}
                                        disabled={formData.phone.length <= 1}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={addPhoneNumber}>
                                Add another phone
                            </Button>
                            {state?.errors?.phone && <p className="text-sm text-destructive">{state.errors.phone.join(', ')}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Verification Status</Label>
                             <RadioGroup 
                                name="verification_status" 
                                value={formData.verification_status}
                                onValueChange={(value) => setFormData({...formData, verification_status: value as Client['verification_status']})}
                                className="flex items-center gap-4 pt-2"
                            >
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Pending" id="status-pending" />
                                    <Label htmlFor="status-pending" className="font-normal">Pending</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Active" id="status-active" />
                                    <Label htmlFor="status-active" className="font-normal">Active</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Inactive" id="status-inactive" />
                                    <Label htmlFor="status-inactive" className="font-normal">Inactive</Label>
                                </div>
                            </RadioGroup>
                             {state?.errors?.verification_status && <p className="text-sm text-destructive">{state.errors.verification_status[0]}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Favorite Bank Account</Label>
                            <Input
                                value={favoriteBankAccount?.name ? `${favoriteBankAccount.name} (${favoriteBankAccount.id})` : 'None'}
                                readOnly
                                disabled
                            />
                            <p className="text-xs text-muted-foreground">This is automatically set by the last confirmed transaction.</p>
                        </div>
                        <div className="space-y-2">
                            <Label>Review Flags</Label>
                            <div className="flex flex-wrap items-center gap-4 pt-2">
                                {settings?.transaction_flags?.map(flag => (
                                <div key={flag.id} className="flex items-center space-x-2">
                                    <Checkbox 
                                        id={`flag-${flag.id}`} 
                                        name="review_flags" 
                                        value={flag.id} 
                                        checked={formData.review_flags?.includes(flag.id)}
                                        onCheckedChange={(checked) => handleFlagChange(flag.id, !!checked)}
                                    />
                                    <Label htmlFor={`flag-${flag.id}`} className="font-normal">{flag.name}</Label>
                                </div>
                                ))}
                                {!settings?.transaction_flags?.length && <p className="text-xs text-muted-foreground">No flags configured in settings.</p>}
                            </div>
                        </div>
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="prioritize_sms_matching"
                                    name="prioritize_sms_matching"
                                    checked={formData.prioritize_sms_matching}
                                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, prioritize_sms_matching: !!checked }))}
                                />
                                <Label htmlFor="prioritize_sms_matching" className="font-normal">Prioritize for SMS Auto-Matching</Label>
                            </div>
                            <p className="text-xs text-muted-foreground">If multiple clients share a name, enabling this makes this client the default match.</p>
                             {showPriorityWarning && (
                                <Alert variant="destructive" className="mt-2">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertDescription>
                                        Warning: The following clients share a similar name. Enabling this option will prevent them from being auto-matched:
                                        <ul className="list-disc pl-5 mt-1">
                                            {otherClientsWithSameName?.map(c => <li key={c.id}>{c.name}</li>)}
                                        </ul>
                                    </AlertDescription>
                                </Alert>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
            <div className="md:col-span-1 space-y-4">
                 <Card>
                    <CardHeader>
                        <CardTitle>Bank Accounts Used</CardTitle>
                        <CardDescription>Accounts from confirmed transactions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {usedBankAccounts.length > 0 ? (
                            <ul className="divide-y divide-border rounded-md border bg-background">
                                {usedBankAccounts.map((account) => (
                                    <li key={account.id} className="flex items-center justify-between p-3 text-sm">
                                        <div>
                                            <p className="font-medium">{account.name}</p>
                                            <p className="text-xs text-muted-foreground">Last used: {format(parseISO(account.lastUsed), 'PPP')}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => handleDeleteClick(
                                                `unfavorite_bank_account:${account.id}`,
                                                'Unlink Favorite Account?',
                                                `Are you sure you want to remove the favorite link to bank account "${account.name}"? This only applies if it is the current favorite.`
                                            )}
                                            variant="ghost"
                                            size="icon"
                                            title="Unset as favorite if this is the favorite account"
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-muted-foreground p-3 border rounded-md">No bank accounts used in confirmed transactions.</p>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Crypto Wallets Used (BEP20)</CardTitle>
                        <CardDescription>Addresses are automatically added from confirmed deposit transactions.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {bep20Addresses && bep20Addresses.length > 0 ? (
                            <ul className="divide-y divide-border rounded-md border bg-background">
                                {bep20Addresses.map((address) => (
                                    <li key={address} className="flex items-center justify-between p-3 text-sm">
                                        <div>
                                            <p className="font-mono break-all">{address}</p>
                                            {cryptoWalletsLastUsed.has(address.toLowerCase()) && (
                                                <p className="text-xs text-muted-foreground">Last used: {format(parseISO(cryptoWalletsLastUsed.get(address.toLowerCase())!), 'PPP')}</p>
                                            )}
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => handleDeleteClick(
                                                `delete_address:${address}`,
                                                'Delete Address?',
                                                `Are you sure you want to remove the address "${address}"? This cannot be undone.`
                                            )}
                                            variant="ghost"
                                            size="icon"
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                             <p className="text-sm text-muted-foreground p-3 border rounded-md">No BEP20 addresses recorded for this client.</p>
                        )}
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle>KYC Documents</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {kycDocuments && kycDocuments.length > 0 && (
                            <div className="space-y-2">
                                <Label>Uploaded Documents</Label>
                                <ul className="divide-y divide-border rounded-md border bg-background">
                                    {kycDocuments.map((doc) => (
                                        <li key={doc.name} className="flex items-center justify-between p-3 text-sm">
                                            <Button variant="link" asChild className="p-0 h-auto justify-start">
                                                <Link href={doc.url} target="_blank" rel="noopener noreferrer">
                                                    {doc.name}
                                                </Link>
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => handleDeleteClick(
                                                    `delete:${doc.name}`,
                                                    'Delete Document?',
                                                    `Are you sure you want to delete the document "${doc.name}"? This cannot be undone.`
                                                )}
                                                variant="ghost"
                                                size="icon"
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                         <div className="space-y-2">
                            <Label htmlFor="kyc_files">Upload New Document(s)</Label>
                            <Input id="kyc_files" name="kyc_files" type="file" multiple onChange={handleFileChange} />
                            <p className="text-sm text-muted-foreground">You can select multiple files at once.</p>
                        </div>
                        {filesToUpload.length > 0 && (
                            <div className="space-y-2">
                                <Label>File Previews</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {filesToUpload.map((file, index) => (
                                        <div key={index} className="relative group border rounded-md p-1 bg-muted/50">
                                            {previews[index] && file.type.startsWith('image/') ? (
                                                <img src={previews[index]} alt={file.name} className="rounded-md aspect-square object-cover" />
                                            ) : (
                                                <div className="aspect-square flex items-center justify-center">
                                                    <p className="text-xs text-muted-foreground p-1 text-center">{file.name}</p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
             <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {isSaving ? 'Saving...' : 'Save Client'}
                </Button>
            </div>
        </form>

        <AlertDialog open={!!dialogState?.open} onOpenChange={(open) => !open && handleDialogCancel()}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{dialogState?.title}</AlertDialogTitle>
                    <AlertDialogDescription>{dialogState?.description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleDialogCancel}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleSubmit(dialogState!.intent)}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
