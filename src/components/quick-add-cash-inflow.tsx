

'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';
import { MatchUnusedSmsForm } from './match-unused-sms-form';
import type { Client } from '@/lib/types';

interface QuickAddCashInflowProps {
  client: Client;
  onRecordCreated: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddCashInflow({ client, onRecordCreated, isOpen, setIsOpen }: QuickAddCashInflowProps) {
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Cash Inflow</DialogTitle>
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
