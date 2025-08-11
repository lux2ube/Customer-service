
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
import { QuickUsdtPaymentForm } from './quick-usdt-payment-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client } from '@/lib/types';

interface QuickAddUsdtOutflowProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRecordCreated: () => void;
}

export function QuickAddUsdtOutflow({ client, isOpen, setIsOpen, onRecordCreated }: QuickAddUsdtOutflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add USDT Outflow for {client.name}</DialogTitle>
          <DialogDescription>
            Choose to record manually, send live, or match an unassigned BSCScan transaction.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual Record</TabsTrigger>
            <TabsTrigger value="auto">Auto Send</TabsTrigger>
            <TabsTrigger value="match">Match BSCScan</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <QuickUsdtPaymentForm client={client} onPaymentCreated={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
           <TabsContent value="auto">
            <p>Auto Send Form Placeholder</p>
          </TabsContent>
          <TabsContent value="match">
             <MatchUnassignedBscTxForm client={client} onTxMatched={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
