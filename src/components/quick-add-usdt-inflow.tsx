

'use client';

import * as React from 'react';
import { QuickUsdtReceiptForm } from './quick-usdt-receipt-form';
import type { Client } from '@/lib/types';

interface QuickAddUsdtInflowProps {
  client: Client;
  onRecordCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddUsdtInflow({ client, onRecordCreated, setIsOpen }: QuickAddUsdtInflowProps) {
  if (!client) return null;
  return <QuickUsdtReceiptForm client={client} onReceiptCreated={onRecordCreated} setIsOpen={setIsOpen} />;
}
