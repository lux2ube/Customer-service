
'use client';

import * as React from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';
import { MatchUnusedSmsForm } from './match-unused-sms-form';
import type { Client } from '@/lib/types';

interface QuickAddCashInflowProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRecordCreated: () => void;
}

export function QuickAddCashInflow({ client, isOpen, setIsOpen, onRecordCreated }: QuickAddCashInflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Cash Inflow for {client.name}</DialogTitle>
          <DialogDescription>
            Choose to record a new manual receipt or match an existing SMS.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual Receipt</TabsTrigger>
            <TabsTrigger value="sms">Match SMS</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <QuickCashReceiptForm client={client} onReceiptCreated={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
          <TabsContent value="sms">
            <MatchUnusedSmsForm client={client} onSmsMatched={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
