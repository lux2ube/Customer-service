

'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickUsdtReceiptForm } from './quick-usdt-receipt-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client } from '@/lib/types';

interface QuickAddUsdtInflowProps {
  client: Client;
  onRecordCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddUsdtInflow({ client, onRecordCreated, setIsOpen }: QuickAddUsdtInflowProps) {
  if (!client) return null;

  return (
    <Tabs defaultValue="manual" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="manual">Manual Receipt</TabsTrigger>
        <TabsTrigger value="match">Match BSCScan</TabsTrigger>
      </TabsList>
      <TabsContent value="manual">
        <QuickUsdtReceiptForm client={client} onReceiptCreated={onRecordCreated} setIsOpen={setIsOpen} />
      </TabsContent>
      <TabsContent value="match">
        <MatchUnassignedBscTxForm client={client} onTxMatched={onRecordCreated} setIsOpen={setIsOpen} />
      </TabsContent>
    </Tabs>
  );
}
