
'use client';

import * as React from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import type { CashReceipt, SmsTransaction } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Input } from './ui/input';
import { MessageSquareText } from 'lucide-react';

// A unified type for the table
type UnifiedReceipt = {
    id: string;
    date: string;
    clientName: string;
    senderName: string;
    bankAccountName: string;
    amount: number;
    currency: string;
    remittanceNumber?: string;
    source: 'Manual' | 'SMS';
}

export function CashReceiptsTable() {
  const [receipts, setReceipts] = React.useState<UnifiedReceipt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    const receiptsRef = ref(db, 'cash_receipts/');
    const smsRef = ref(db, 'sms_transactions/');

    let manualReceipts: CashReceipt[] = [];
    let smsCredits: SmsTransaction[] = [];
    
    const combineAndSetReceipts = () => {
        const unifiedManuals: UnifiedReceipt[] = manualReceipts.map(r => ({
            id: r.id,
            date: r.date,
            clientName: r.clientName,
            senderName: r.senderName,
            bankAccountName: r.bankAccountName,
            amount: r.amount,
            currency: r.currency,
            remittanceNumber: r.remittanceNumber,
            source: 'Manual',
        }));

        const unifiedSms: UnifiedReceipt[] = smsCredits
            .filter(sms => sms.type === 'credit')
            .map(sms => ({
                id: sms.id,
                date: sms.parsed_at,
                clientName: sms.matched_client_name || 'Unmatched',
                senderName: sms.client_name,
                bankAccountName: sms.account_name || 'N/A',
                amount: sms.amount || 0,
                currency: sms.currency || '',
                remittanceNumber: sms.transaction_id,
                source: 'SMS',
            }));

        const allReceipts = [...unifiedManuals, ...unifiedSms];
        allReceipts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setReceipts(allReceipts);
        setLoading(false);
    }
    
    const unsubscribeManual = onValue(receiptsRef, (snapshot) => {
        const data = snapshot.val();
        manualReceipts = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        combineAndSetReceipts();
    });
    
    const unsubscribeSms = onValue(smsRef, (snapshot) => {
        const data = snapshot.val();
        smsCredits = data ? Object.keys(data).map(key => ({ id: key, ...data[key] })) : [];
        combineAndSetReceipts();
    });

    return () => {
        unsubscribeManual();
        unsubscribeSms();
    };
  }, []);
  
  const filteredReceipts = React.useMemo(() => {
    if (!search) return receipts;
    const lowercasedSearch = search.toLowerCase();
    return receipts.filter(r => 
        (r.clientName && r.clientName.toLowerCase().includes(lowercasedSearch)) ||
        (r.senderName && r.senderName.toLowerCase().includes(lowercasedSearch)) ||
        (r.bankAccountName && r.bankAccountName.toLowerCase().includes(lowercasedSearch)) ||
        (r.remittanceNumber && r.remittanceNumber.toLowerCase().includes(lowercasedSearch))
    );
  }, [receipts, search]);

  return (
    <div className="space-y-4">
        <div className="flex items-center">
            <Input 
                placeholder="Search by client, sender, bank..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
            />
        </div>
        <div className="rounded-md border bg-card">
            <Table>
            <TableHeader>
                <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Source</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                    Loading receipts...
                    </TableCell>
                </TableRow>
                ) : filteredReceipts.length > 0 ? (
                filteredReceipts.map((receipt) => (
                    <TableRow key={`${receipt.source}-${receipt.id}`}>
                    <TableCell>
                        {receipt.date && !isNaN(new Date(receipt.date).getTime())
                        ? format(new Date(receipt.date), 'Pp')
                        : 'N/A'}
                    </TableCell>
                    <TableCell className="font-medium">{receipt.clientName}</TableCell>
                    <TableCell>{receipt.senderName}</TableCell>
                    <TableCell>{receipt.bankAccountName}</TableCell>
                    <TableCell className="text-right font-mono">
                        {new Intl.NumberFormat().format(receipt.amount)} {receipt.currency}
                    </TableCell>
                     <TableCell>
                        {receipt.source === 'SMS' ? (
                            <Badge variant="secondary">
                                <MessageSquareText className="mr-1 h-3 w-3" />
                                {receipt.source}
                            </Badge>
                        ) : (
                             <Badge variant="outline">{receipt.source}</Badge>
                        )}
                     </TableCell>
                    </TableRow>
                ))
                ) : (
                <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                    No cash receipts found.
                    </TableCell>
                </TableRow>
                )}
            </TableBody>
            </Table>
        </div>
    </div>
  );
}
