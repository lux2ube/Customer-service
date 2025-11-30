

'use client';

import * as React from 'react';
import { QuickCashPaymentForm } from './quick-cash-payment-form';
import type { Client } from '@/lib/types';

interface QuickAddCashOutflowProps {
  client: Client;
  onRecordCreated: () => void;
  setIsOpen: (open: boolean) => void;
}

export function QuickAddCashOutflow({ client, onRecordCreated, setIsOpen }: QuickAddCashOutflowProps) {
  if (!client) return null;
  return <QuickCashPaymentForm client={client} onPaymentCreated={onRecordCreated} setIsOpen={setIsOpen} />;
}
