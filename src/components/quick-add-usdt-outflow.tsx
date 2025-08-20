
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
  onRecordCreated: (newRecordId?: string) => void;
  usdtAccounts: Account[];
  serviceProviders: ServiceProvider[];
  defaultRecordingAccountId: string;
  autoProcessData?: { amount: number, address?: string } | null;
  onDialogClose?: () => void;
}

export function QuickAddUsdtOutflow({ 
    client, 
    isOpen, 
    setIsOpen, 
    onRecordCreated, 
    usdtAccounts, 
    serviceProviders, 
    defaultRecordingAccountId,
    autoProcessData,
    onDialogClose
}: QuickAddUsdtOutflowProps) {
  if (!client) return null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && onDialogClose) {
        onDialogClose();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add USDT Outflow for {client.name}</DialogTitle>
          <DialogDescription>
            Choose to send live, record manually, or match an unassigned BSCScan transaction.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={autoProcessData ? "auto" : "auto"} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual Record</TabsTrigger>
            <TabsTrigger value="auto">Auto Send</TabsTrigger>
            <TabsTrigger value="match">Match BSCScan</TabsTrigger>
          </TabsList>
          <TabsContent value="manual">
            <QuickUsdtManualForm 
                client={client} 
                onPaymentCreated={onRecordCreated} 
                setIsOpen={setIsOpen} 
                usdtAccounts={usdtAccounts} 
                serviceProviders={serviceProviders}
            />
          </TabsContent>
           <TabsContent value="auto">
            <QuickUsdtAutoForm client={client} onPaymentSent={onRecordCreated} setIsOpen={setIsOpen} usdtAccounts={usdtAccounts} serviceProviders={serviceProviders} defaultRecordingAccountId={defaultRecordingAccountId} autoProcessData={autoProcessData} />
          </TabsContent>
          <TabsContent value="match">
             <MatchUnassignedBscTxForm client={client} onTxMatched={() => onRecordCreated()} setIsOpen={setIsOpen} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
