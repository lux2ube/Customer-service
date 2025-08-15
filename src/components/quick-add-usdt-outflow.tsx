

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
import { QuickUsdtManualForm } from './quick-usdt-manual-form';
import { QuickUsdtAutoForm } from './quick-usdt-auto-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client, Account, ServiceProvider } from '@/lib/types';
import { db } from '@/lib/firebase';
import { get, ref } from 'firebase/database';

interface QuickAddUsdtOutflowProps {
  client: Client | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onRecordCreated: () => void;
  usdtAccounts: Account[];
  serviceProviders: ServiceProvider[];
  defaultRecordingAccountId: string;
}

export function QuickAddUsdtOutflow({ client, isOpen, setIsOpen, onRecordCreated, usdtAccounts, serviceProviders, defaultRecordingAccountId }: QuickAddUsdtOutflowProps) {
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
        <Tabs defaultValue="auto" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual Record</TabsTrigger>
            <TabsTrigger value="auto">Auto Send</TabsTrigger>
            <TabsTrigger value="match">Match BSCScan</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <QuickUsdtManualForm client={client} onPaymentCreated={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
           <TabsContent value="auto">
            <QuickUsdtAutoForm client={client} onPaymentSent={onRecordCreated} setIsOpen={setIsOpen} usdtAccounts={usdtAccounts} serviceProviders={serviceProviders} defaultRecordingAccountId={defaultRecordingAccountId} />
          </TabsContent>
          <TabsContent value="match">
             <MatchUnassignedBscTxForm client={client} onTxMatched={onRecordCreated} setIsOpen={setIsOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
