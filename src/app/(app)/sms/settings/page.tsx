'use client';

import * as React from 'react';
import { PageHeader } from "@/components/page-header";
import { Button } from '@/components/ui/button';
import { PlusCircle, Copy, Pencil } from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import type { Account, SmsParser } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SmsParserForm } from '@/components/sms-parser-form';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

export default function SmsSettingsPage() {
    const [parsers, setParsers] = React.useState<SmsParser[]>([]);
    const [accounts, setAccounts] = React.useState<Account[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isDialogOpen, setIsDialogOpen] = React.useState(false);
    const [selectedParser, setSelectedParser] = React.useState<SmsParser | undefined>(undefined);
    const { toast } = useToast();

    React.useEffect(() => {
        const parsersRef = ref(db, 'sms_parsers/');
        const accountsRef = ref(db, 'accounts');

        const unsubscribeParsers = onValue(parsersRef, (snapshot) => {
            const data = snapshot.val();
            const list: SmsParser[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setParsers(list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
            setLoading(false);
        });

        const unsubscribeAccounts = onValue(accountsRef, (snapshot) => {
            const data = snapshot.val();
            const list: Account[] = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
            setAccounts(list.filter(acc => !acc.isGroup));
        });

        return () => {
            unsubscribeParsers();
            unsubscribeAccounts();
        };
    }, []);

    const handleNewClick = () => {
        setSelectedParser(undefined);
        setIsDialogOpen(true);
    };

    const handleEditClick = (parser: SmsParser) => {
        setSelectedParser(parser);
        setIsDialogOpen(true);
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: 'Copied to clipboard!' });
    };

    return (
        <>
            <PageHeader
                title="SMS Parser Settings"
                description="Configure parsers for incoming SMS transactions."
            >
                <Button onClick={handleNewClick}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    New Parser
                </Button>
            </PageHeader>
            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Account Name</TableHead>
                            <TableHead>Endpoint URL</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-full" /></TableCell>
                                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-8 w-8 float-right" /></TableCell>
                                </TableRow>
                            ))
                        ) : parsers.length > 0 ? (
                            parsers.map(parser => (
                                <TableRow key={parser.id}>
                                    <TableCell className="font-medium">{parser.account_name || parser.account_id}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 font-mono text-sm">
                                            <span className="truncate">{parser.endpoint_url}</span>
                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleCopy(parser.endpoint_url)}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={parser.active ? 'default' : 'secondary'}>
                                            {parser.active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="icon" onClick={() => handleEditClick(parser)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    No SMS parsers found. Create one to get started.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                        <DialogTitle>{selectedParser ? 'Edit' : 'Create New'} SMS Parser</DialogTitle>
                        <DialogDescription>
                            Configure how incoming SMS messages are parsed into transactions for a specific account.
                        </DialogDescription>
                    </DialogHeader>
                    <SmsParserForm
                        parser={selectedParser}
                        accounts={accounts}
                        onSuccess={() => setIsDialogOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
