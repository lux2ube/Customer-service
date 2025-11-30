

'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickUsdtAutoForm } from './quick-usdt-auto-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client, Account, ServiceProvider } from '@/lib/types';
import { UsdtManualPaymentForm } from './usdt-manual-payment-form';

interface QuickAddUsdtOutflowProps {
  client: Client;
  onRecordCreated: (newRecordId?: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  usdtAccounts: Account[];
  serviceProviders: ServiceProvider[];
  defaultRecordingAccountId: string;
  autoProcessData?: { amount: number, address?: string } | null;
  onDialogClose?: () => void;
}

export function QuickAddUsdtOutflow({ 
    client, 
    onRecordCreated, 
    isOpen,
    setIsOpen,
    usdtAccounts, 
    serviceProviders, 
    defaultRecordingAccountId,
    autoProcessData,
    onDialogClose
}: QuickAddUsdtOutflowProps) {
  if (!client) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record USDT Outflow</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue={autoProcessData ? "auto" : "auto"} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="auto">Auto Send</TabsTrigger>
            <TabsTrigger value="match">Match BSCScan</TabsTrigger>
            <TabsTrigger value="manual-out">Manual Out</TabsTrigger>
          </TabsList>
          <TabsContent value="auto">
            <QuickUsdtAutoForm 
                client={client} 
                onPaymentSent={onRecordCreated} 
                setIsOpen={setIsOpen} 
                usdtAccounts={usdtAccounts} 
                serviceProviders={serviceProviders} 
                defaultRecordingAccountId={defaultRecordingAccountId} 
                autoProcessData={autoProcessData} 
                onDialogClose={onDialogClose}
            />
          </TabsContent>
          <TabsContent value="match">
            <MatchUnassignedBscTxForm client={client} onTxMatched={() => onRecordCreated()} setIsOpen={setIsOpen} />
          </TabsContent>
          <TabsContent value="manual-out">
            <UsdtManualPaymentForm clientFromProps={client} onFormSubmit={onRecordCreated} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
