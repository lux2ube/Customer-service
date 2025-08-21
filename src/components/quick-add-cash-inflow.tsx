

'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';
import { MatchUnusedSmsForm } from './match-unused-sms-form';
import type { Client } from '@/lib/types';

interface QuickAddCashInflowProps {
  client: Client;
  onRecordCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddCashInflow({ client, onRecordCreated, setIsOpen }: QuickAddCashInflowProps) {
  return (
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
  );
}
