
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Client, Transaction } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import { Loader2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';
import { logAction } from '@/lib/actions/helpers';

interface MatchUnassignedBscTxFormProps {
  client: Client;
  onTxMatched: () => void;
  setIsOpen: (open: boolean) => void;
}

export function MatchUnassignedBscTxForm({ client, onTxMatched, setIsOpen }: MatchUnassignedBscTxFormProps) {
  const [txList, setTxList] = React.useState<Transaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const txRef = ref(db, 'transactions');
    const unsubscribe = onValue(txRef, (snapshot) => {
      if (snapshot.exists()) {
        const allTxs: Transaction[] = Object.values(snapshot.val());
        const unassigned = allTxs.filter(tx => tx.clientId === 'unassigned-bscscan');
        setTxList(unassigned.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleMatch = async (tx: Transaction) => {
    if (!tx.id) return;
    try {
        const updates: {[key: string]: any} = {};
        updates[`/transactions/${tx.id}/clientId`] = client.id;
        updates[`/transactions/${tx.id}/clientName`] = client.name;
        
        await update(ref(db), updates);

        await logAction(
            'match_bscscan_tx',
            { type: 'transaction', id: tx.id, name: `Matched BSC Tx for ${client.name}` },
            { oldClientId: tx.clientId, newClientId: client.id }
        );

        toast({ title: 'Success', description: 'BSCScan transaction matched.' });
        onTxMatched();
        setIsOpen(false);
    } catch(error: any) {
        toast({ title: 'Error', description: error.message || 'Failed to match transaction.', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : txList.length > 0 ? (
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-4">
            {txList.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="flex-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold">{tx.amount_usdt.toLocaleString()} USDT</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(tx.date), 'PP')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">From: {tx.client_wallet_address}</p>
                </div>
                <Button size="sm" onClick={() => handleMatch(tx)}>
                    <Check className="mr-2 h-4 w-4" /> Match
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center text-muted-foreground py-10">
          <p>No unassigned BSCScan transactions found.</p>
        </div>
      )}
    </div>
  );
}
