
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Client, UsdtRecord } from '@/lib/types';
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
  const [recordList, setRecordList] = React.useState<UsdtRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const recordRef = ref(db, 'modern_usdt_records');
    const unsubscribe = onValue(recordRef, (snapshot) => {
      if (snapshot.exists()) {
        const allRecords: UsdtRecord[] = Object.values(snapshot.val());
        const unassigned = allRecords.filter(r => !r.clientId);
        setRecordList(unassigned.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      } else {
        setRecordList([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleMatch = async (record: UsdtRecord) => {
    if (!record.id) return;
    try {
        const updates: {[key: string]: any} = {};
        updates[`/modern_usdt_records/${record.id}/clientId`] = client.id;
        updates[`/modern_usdt_records/${record.id}/clientName`] = client.name;
        
        await update(ref(db), updates);

        await logAction(
            'match_bscscan_tx',
            { type: 'usdt_record', id: record.id, name: `Matched BSC Tx for ${client.name}` },
            { oldClientId: record.clientId, newClientId: client.id }
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
      ) : recordList.length > 0 ? (
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-4">
            {recordList.map(record => (
              <div key={record.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="flex-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold">{record.amount.toLocaleString()} USDT</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(record.date), 'PP')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {record.type === 'inflow' ? 'From' : 'To'}: {record.clientWalletAddress || 'N/A'}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleMatch(record)}>
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
