

'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { QuickUsdtManualForm } from './quick-usdt-manual-form';
import { QuickUsdtAutoForm } from './quick-usdt-auto-form';
import { MatchUnassignedBscTxForm } from './match-unassigned-bsc-tx-form';
import type { Client, Account, ServiceProvider } from '@/lib/types';

interface QuickAddUsdtOutflowProps {
  client: Client;
  onRecordCreated: (newRecordId?: string) => void;
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
    setIsOpen,
    usdtAccounts, 
    serviceProviders, 
    defaultRecordingAccountId,
    autoProcessData,
    onDialogClose
}: QuickAddUsdtOutflowProps) {
  if (!client) return null;

  return (
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
            onClose={onDialogClose}
        />
      </TabsContent>
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
    </Tabs>
  );
}
