

'use client';

import * as React from 'react';
import { QuickUsdtAutoForm } from './quick-usdt-auto-form';
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
  );
}
