
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickUsdtReceiptForm } from './quick-usdt-receipt-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client } from '@/lib/types';

interface QuickAddUsdtInflowProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRecordCreated: () => void;
}

export function QuickAddUsdtInflow({ client, isOpen, setIsOpen, onRecordCreated }: QuickAddUsdtInflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add USDT Inflow for {client.name}</DialogTitle>
          <DialogDescription>
            Choose to record a manual receipt or match an unassigned BSCScan transaction.
          </DialogDescription>
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
