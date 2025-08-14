
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Save, Trash2, Loader2, AlertTriangle, History, LinkIcon, Landmark, Wallet2 } from 'lucide-react';
import React from 'react';
import { useActionState } from 'react';
import { createClient, manageClient, type ClientFormState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Checkbox } from './ui/checkbox';
import type { Client, Account, ClientActivity, AuditLog, ServiceProvider } from '@/lib/types';
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
import { Alert, AlertDescription as UiAlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { Accordion, AccordionTrigger, AccordionContent, AccordionItem } from './ui/accordion';

export function ClientForm({ client, activityHistory, otherClientsWithSameName, auditLogs, usedServiceProviders }: { client?: Client, activityHistory?: ClientActivity[], otherClientsWithSameName?: Client[], auditLogs?: AuditLog[], usedServiceProviders?: ServiceProvider[] }) {
    const { toast } = useToast();
    const router = useRouter();
    const formRef = React.useRef<HTMLFormElement>(null);

    const [state, setState] = React.useState<ClientFormState>();
    const [isSaving, setIsSaving] = React.useState(false);
    
    const [formData, setFormData] = React.useState({
        name: client?.name || '',
        phone: client?.phone ? (Array.isArray(client.phone) ? (client.phone.length > 0 ? client.phone : ['']) : [client.phone]) : [''],
        verification_status: client?.verification_status || 'Pending',
        prioritize_sms_matching: client?.prioritize_sms_matching || false,
    });
    
    const [filesToUpload, setFilesToUpload] = React.useState<File[]>([]);
    const [previews, setPreviews] = React.useState<string[]>([]);

    const [kycDocuments, setKycDocuments] = React.useState(client?.kyc_documents || []);
    const [bep20Addresses, setBep20Addresses] = React.useState(client?.bep20_addresses || []);

    const [dialogState, setDialogState] = React.useState<{
        open: boolean;
        title: string;
        description: string;
        intent: string;
    } | null>(null);

    const cryptoWalletsLastUsed = React.useMemo(() => {
        if (!activityHistory) return new Map<string, string>();
        const lastUsedMap = new Map<string, string>();
        activityHistory
            .filter(tx => tx.source === 'Transaction' && tx.link)
             .forEach(tx => {
                // We can't get client_wallet_address directly, this logic will be simplified.
            });
        return lastUsedMap;
    }, [activityHistory]);

    const processFormResult = (result: ClientFormState) => {
        if (result?.success) {
            toast({ title: 'Success', description: result.message });
            if (result.intent?.startsWith('delete:')) {
                const docName = result.intent.split(':')[1];
                setKycDocuments(prev => prev.filter(doc => doc.name !== docName));
            } else if (result.intent?.startsWith('delete_address:')) {
                const address = result.intent.split(':')[1];
                setBep20Addresses(prev => prev.filter(a => a !== address));
            } else if (result.clientId) {
                // If it was a new client, redirect to the edit page
                 router.push(`/clients/${result.clientId}/edit`);
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
    
    const showPriorityWarning = formData.prioritize_sms_matching && otherClientsWithSameName && otherClientsWithSameName.length > 0;

    const getStatusVariant = (status: string) => {
        switch(status?.toLowerCase()) {
            case 'confirmed':
            case 'used':
            case 'matched': return 'default';
            case 'pending':
            case 'parsed': return 'secondary';
            case 'cancelled':
            case 'rejected': return 'destructive';
            default: return 'outline';
        }
    }

    return (
        <>
            <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit('save_client'); }}>
                <Card>
                    <CardHeader>
                        <CardTitle>ملف العميل</CardTitle>
                        <CardDescription>
                            {client ? `رقم السند: ${client.id}` : 'Fill in the details for the new client profile.'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Tabs defaultValue="profile">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="profile">Profile</TabsTrigger>
                                <TabsTrigger value="history" disabled={!client}>History</TabsTrigger>
                                <TabsTrigger value="accounts" disabled={!client}>Accounts &amp; Wallets</TabsTrigger>
                                <TabsTrigger value="kyc" disabled={!client}>KYC &amp; Audit</TabsTrigger>
                            </TabsList>
                            <TabsContent value="profile" className="mt-6 space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Full Name</Label>
                                    <Input id="name" name="name" placeholder="e.g., John M. Doe" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                                    {state?.errors?.name && <p className="text-sm text-destructive">{state.errors.name[0]}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Phone Number(s)</Label>
                                    {formData.phone.map((phone, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <Input name="phone" placeholder="e.g., 555-1234" value={phone} onChange={(e) => handlePhoneChange(index, e.target.value)} required />
                                            <Button type="button" variant="ghost" size="icon" onClick={() => removePhoneNumber(index)} disabled={formData.phone.length <= 1}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={addPhoneNumber}>Add another phone</Button>
                                    {state?.errors?.phone && <p className="text-sm text-destructive">{state.errors.phone.join(', ')}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Verification Status</Label>
                                    <RadioGroup name="verification_status" value={formData.verification_status} onValueChange={(value) => setFormData({...formData, verification_status: value as Client['verification_status']})} className="flex items-center gap-4 pt-2">
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Pending" id="status-pending" /><Label htmlFor="status-pending" className="font-normal">Pending</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Active" id="status-active" /><Label htmlFor="status-active" className="font-normal">Active</Label></div>
                                        <div className="flex items-center space-x-2"><RadioGroupItem value="Inactive" id="status-inactive" /><Label htmlFor="status-inactive" className="font-normal">Inactive</Label></div>
                                    </RadioGroup>
                                    {state?.errors?.verification_status && <p className="text-sm text-destructive">{state.errors.verification_status[0]}</p>}
                                </div>
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox id="prioritize_sms_matching" name="prioritize_sms_matching" checked={formData.prioritize_sms_matching} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, prioritize_sms_matching: !!checked }))} />
                                        <Label htmlFor="prioritize_sms_matching" className="font-normal">Prioritize for SMS Auto-Matching</Label>
                                    </div>
                                    <p className="text-xs text-muted-foreground">If multiple clients share a name, enabling this makes this client the default match.</p>
                                    {showPriorityWarning && (
                                        <Alert variant="destructive" className="mt-2">
                                            <AlertTriangle className="h-4 w-4" />
                                            <UiAlertDescription>Warning: {otherClientsWithSameName?.length} other clients share a similar name. Enabling this option will prevent them from being auto-matched.</UiAlertDescription>
                                        </Alert>
                                    )}
                                </div>
                            </TabsContent>
                            <TabsContent value="history" className="mt-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Client Activity History</CardTitle>
                                        <CardDescription>A complete timeline of all financial activities for this client.</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Type</TableHead>
                                                        <TableHead>Description</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                        <TableHead>Status</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {activityHistory && activityHistory.length > 0 ? (
                                                        activityHistory.map((item) => (
                                                            <TableRow key={item.id}>
                                                                <TableCell className="text-xs">{item.date ? format(parseISO(item.date), 'PP p') : 'N/A'}</TableCell>
                                                                <TableCell><Badge variant="secondary" className="font-normal">{item.type}</Badge></TableCell>
                                                                <TableCell className="text-xs">{item.description}</TableCell>
                                                                <TableCell className={cn("text-right font-mono", item.amount < 0 && "text-destructive")}>
                                                                    {new Intl.NumberFormat('en-US').format(item.amount)} {item.currency}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Badge variant={getStatusVariant(item.status)} className="capitalize">{item.status}</Badge>
                                                                </TableCell>
                                                            </TableRow>
                                                        ))
                                                    ) : (
                                                        <TableRow>
                                                            <TableCell colSpan={5} className="h-24 text-center">No activity found.</TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                           <TabsContent value="accounts" className="mt-6 space-y-6">
                                <div>
                                    <h4 className="font-medium text-sm mb-2">Saved Payment Methods</h4>
                                    <p className="text-xs text-muted-foreground mb-3">Payment details saved from previous transactions, grouped by service provider.</p>
                                    {client?.serviceProviders && client.serviceProviders.length > 0 && usedServiceProviders ? (
                                        <Accordion type="multiple" className="w-full">
                                            {usedServiceProviders.map(provider => {
                                                const clientMethodsForProvider = client.serviceProviders?.filter(sp => sp.providerId === provider.id);
                                                if (!clientMethodsForProvider || clientMethodsForProvider.length === 0) return null;

                                                return (
                                                <AccordionItem value={provider.id} key={provider.id}>
                                                    <AccordionTrigger className="text-sm font-semibold hover:no-underline p-3 bg-muted/50 rounded-md">
                                                        <div className="flex items-center gap-2">
                                                            {provider.type === 'Bank' ? <Landmark className="h-4 w-4" /> : <Wallet2 className="h-4 w-4" />}
                                                            {provider.name}
                                                        </div>
                                                    </AccordionTrigger>
                                                    <AccordionContent className="pt-2">
                                                        <ul className="divide-y divide-border border rounded-md">
                                                            {clientMethodsForProvider.map((method, index) => (
                                                                <li key={index} className="p-3 text-sm space-y-1">
                                                                    {Object.entries(method.details).map(([key, value]) => (
                                                                        <div key={key} className="flex justify-between items-center">
                                                                            <span className="text-muted-foreground text-xs">{key}:</span>
                                                                            <span className="font-mono text-xs">{value}</span>
                                                                        </div>
                                                                    ))}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </AccordionContent>
                                                </AccordionItem>
                                                )
                                            })}
                                        </Accordion>

                                    ) : <p className="text-sm text-muted-foreground p-3 border rounded-md">No saved payment methods.</p>}
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm mb-2">Crypto Wallets Used (BEP20)</h4>
                                    <p className="text-xs text-muted-foreground mb-3">Addresses are automatically added from confirmed deposit transactions.</p>
                                    {bep20Addresses && bep20Addresses.length > 0 ? (
                                        <ul className="divide-y divide-border rounded-md border bg-muted/50">
                                            {bep20Addresses.map((address) => (
                                                <li key={address} className="flex items-center justify-between p-3 text-sm">
                                                    <div><p className="font-mono break-all text-xs">{address}</p>{cryptoWalletsLastUsed.has(address.toLowerCase()) && <p className="text-xs text-muted-foreground">Last used: {format(parseISO(cryptoWalletsLastUsed.get(address.toLowerCase())!), 'PPP')}</p>}</div>
                                                    <Button type="button" onClick={() => handleDeleteClick(`delete_address:${address}`, 'Delete Address?', `Are you sure you want to remove this address?`)} variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : <p className="text-sm text-muted-foreground p-3 border rounded-md">No BEP20 addresses recorded.</p>}
                                </div>
                            </TabsContent>
                            <TabsContent value="kyc" className="mt-6 space-y-6">
                                <div className="space-y-2">
                                    <Label>KYC Documents</Label>
                                    {kycDocuments && kycDocuments.length > 0 && (
                                        <ul className="divide-y divide-border rounded-md border bg-muted/50">
                                            {kycDocuments.map((doc) => (
                                                <li key={doc.name} className="flex items-center justify-between p-3 text-sm">
                                                    <Button variant="link" asChild className="p-0 h-auto justify-start"><Link href={doc.url} target="_blank" rel="noopener noreferrer"><LinkIcon className="mr-2 h-3 w-3" />{doc.name}</Link></Button>
                                                    <Button type="button" onClick={() => handleDeleteClick(`delete:${doc.name}`, 'Delete Document?', `Are you sure you want to delete ${doc.name}?`)} variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="kyc_files">Upload New Document(s)</Label>
                                    <Input id="kyc_files" name="kyc_files" type="file" multiple onChange={handleFileChange} />
                                </div>
                                {previews.length > 0 && (
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                        {previews.map((preview, index) => <img key={index} src={preview} alt="Preview" className="rounded-md aspect-square object-cover" />)}
                                    </div>
                                )}
                                <div className="space-y-2 pt-4">
                                     <h4 className="font-medium text-sm mb-2">Audit History</h4>
                                     {auditLogs && auditLogs.length > 0 ? (
                                        <ScrollArea className="h-60 rounded-md border p-3 bg-muted/50">
                                            <div className="space-y-4">
                                                {auditLogs.map(log => (
                                                    <div key={log.id} className="flex items-start gap-3">
                                                        <div className="flex-shrink-0 pt-1"><History className="h-4 w-4 text-muted-foreground" /></div>
                                                        <div><p className="text-xs font-medium capitalize">{log.action.replace(/_/g, ' ')}</p><p className="text-xs text-muted-foreground">by {log.user} on {format(new Date(log.timestamp), 'PP p')}</p></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                     ) : <p className="text-sm text-muted-foreground p-3 border rounded-md">No history found for this client.</p>}
                                </div>
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                    <CardFooter className="flex justify-end border-t pt-4">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {isSaving ? 'Saving...' : 'Save Client'}
                        </Button>
                    </CardFooter>
                </Card>
            </form>

            <AlertDialog open={!!dialogState?.open} onOpenChange={(open) => !open && setDialogState(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader><AlertDialogTitle>{dialogState?.title}</AlertDialogTitle><AlertDialogDescription>{dialogState?.description}</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleSubmit(dialogState!.intent)}>Continue</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

    