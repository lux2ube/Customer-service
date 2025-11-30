

'use client';

import * as React from 'react';
import { QuickCashReceiptForm } from './quick-cash-receipt-form';
import type { Client } from '@/lib/types';

interface QuickAddCashInflowProps {
  client: Client;
  onRecordCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddCashInflow({ client, onRecordCreated, setIsOpen }: QuickAddCashInflowProps) {
  return <QuickCashReceiptForm client={client} onReceiptCreated={onRecordCreated} setIsOpen={setIsOpen} />;
}
