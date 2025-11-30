

'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickCashPaymentForm } from './quick-cash-payment-form';
import { MatchUnusedSmsForm } from './match-unused-sms-form';
import type { Client } from '@/lib/types';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { sendTelegramNotification } from '@/lib/actions/helpers';
import { useToast } from '@/hooks/use-toast';
import { Send } from 'lucide-react';

interface QuickAddCashOutflowProps {
  client: Client;
  onRecordCreated: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

function CashOperationForm({ client, setIsOpen }: { client: Client, setIsOpen: (open: boolean) => void }) {
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const amount = formData.get('amount');
        const notes = formData.get('notes');
        
        const message = `
*💸 New Cash Payment Operation Request*
*Client:* ${client.name} (${client.id})
*Phone:* ${Array.isArray(client.phone) ? client.phone.join(', ') : client.phone}
*Amount:* ${amount}
*Notes:* ${notes || 'N/A'}
        `;

        await sendTelegramNotification(message);
        toast({ title: "Request Sent", description: "The cash payment request has been sent to Telegram for processing." });
        setIsOpen(false);
    };
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
             <div className="space-y-2">
                <Label htmlFor="op_amount">Amount</Label>
                <Input id="op_amount" name="amount" type="number" placeholder="e.g., 50000" required />
            </div>
            <div className="space-y-2">
                <Label htmlFor="op_notes">Notes</Label>
                <Textarea id="op_notes" name="notes" placeholder="Any specific instructions for the payment." />
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button type="submit"><Send className="mr-2 h-4 w-4"/>Send Request</Button>
            </div>
        </form>
    );
}

export function QuickAddCashOutflow({ client, onRecordCreated, isOpen, setIsOpen }: QuickAddCashOutflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Cash Outflow</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual Payment</TabsTrigger>
            <TabsTrigger value="sms">Match SMS</TabsTrigger>
            <TabsTrigger value="operation">New Operation</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <QuickCashPaymentForm client={client} onPaymentCreated={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
          <TabsContent value="sms">
            <MatchUnusedSmsForm client={client} onSmsMatched={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
          <TabsContent value="operation">
            <CashOperationForm client={client} setIsOpen={setIsOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
