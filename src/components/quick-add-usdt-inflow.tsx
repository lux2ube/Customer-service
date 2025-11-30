

'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickUsdtReceiptForm } from './quick-usdt-receipt-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client } from '@/lib/types';

interface QuickAddUsdtInflowProps {
  client: Client;
  onRecordCreated: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddUsdtInflow({ client, onRecordCreated, isOpen, setIsOpen }: QuickAddUsdtInflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record USDT Inflow</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
