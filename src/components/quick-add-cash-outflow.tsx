
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
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
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRecordCreated: () => void;
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
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="secondary">Cancel</Button></DialogClose>
                <Button type="submit"><Send className="mr-2 h-4 w-4"/>Send Request</Button>
            </DialogFooter>
        </form>
    );
}

export function QuickAddCashOutflow({ client, isOpen, setIsOpen, onRecordCreated }: QuickAddCashOutflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Cash Outflow for {client.name}</DialogTitle>
          <DialogDescription>
            Choose to record a manual payment, match an SMS, or request a new cash payment operation.
          </DialogDescription>
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
