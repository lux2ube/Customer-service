
'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { useActionState } from 'react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import type { Client } from '@/lib/types';
import { createUsdtManualPayment, createSendRequest, type UsdtPaymentState, type SendRequestState } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Send, ClipboardPaste } from 'lucide-react';
import { ethers } from 'ethers';

// This component is deprecated and will be removed.
// Its logic has been split into QuickUsdtManualForm and QuickUsdtAutoForm.
// This file is kept temporarily to avoid breaking imports but should be deleted.

export function QuickUsdtPaymentForm() {
    return <div>This component is deprecated.</div>
}
