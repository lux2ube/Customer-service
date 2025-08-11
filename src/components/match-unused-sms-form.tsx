
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Client, SmsTransaction } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get } from 'firebase/database';
import { linkSmsToClient } from '@/lib/actions';
import { Loader2, Check } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from './ui/scroll-area';

interface MatchUnusedSmsFormProps {
  client: Client;
  onSmsMatched: () => void;
  setIsOpen: (open: boolean) => void;
}

export function MatchUnusedSmsForm({ client, onSmsMatched, setIsOpen }: MatchUnusedSmsFormProps) {
  const [smsList, setSmsList] = React.useState<SmsTransaction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    setLoading(true);
    const smsRef = ref(db, 'sms_transactions');
    const unsubscribe = onValue(smsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allSms: SmsTransaction[] = Object.values(snapshot.val());
        const unmatched = allSms.filter(sms => sms.status === 'parsed' || !sms.matched_client_id);
        setSmsList(unmatched.sort((a,b) => new Date(b.parsed_at).getTime() - new Date(a.parsed_at).getTime()));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleMatch = async (smsId: string) => {
    const result = await linkSmsToClient(smsId, client.id);
    if (result?.success) {
      toast({ title: 'Success', description: 'SMS matched to client.' });
      onSmsMatched();
      setIsOpen(false);
    } else {
      toast({ title: 'Error', description: result.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4 pt-4">
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : smsList.length > 0 ? (
        <ScrollArea className="h-72">
          <div className="space-y-2 pr-4">
            {smsList.map(sms => (
              <div key={sms.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="flex-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-semibold">{sms.amount?.toLocaleString()} {sms.currency}</span>
                    <span className="text-xs text-muted-foreground">
                      {sms.parsed_at && !isNaN(new Date(sms.parsed_at).getTime()) ? format(new Date(sms.parsed_at), 'PP') : 'Invalid Date'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">From: {sms.client_name}</p>
                </div>
                <Button size="sm" onClick={() => handleMatch(sms.id)}>
                    <Check className="mr-2 h-4 w-4" /> Match
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center text-muted-foreground py-10">
          <p>No unmatched SMS messages found.</p>
        </div>
      )}
    </div>
  );
}
