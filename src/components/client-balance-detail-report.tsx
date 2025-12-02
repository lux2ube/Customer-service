'use client';

import * as React from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Client, JournalEntry, CashRecord, UsdtRecord } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from './ui/skeleton';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ClientRecord {
  id: string;
  type: 'cash' | 'usdt';
  amount: number;
  clientId: string;
  status: string;
  date: string;
  recordType: 'inflow' | 'outflow';
}

interface DetailedEntry {
  journalId: string;
  date: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
}

export function ClientBalanceDetailReport() {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = React.useState('');
  const [records, setRecords] = React.useState<ClientRecord[]>([]);
  const [entries, setEntries] = React.useState<DetailedEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expandedRecord, setExpandedRecord] = React.useState<string | null>(null);

  // Load clients
  React.useEffect(() => {
    const loadClients = async () => {
      try {
        const clientsRef = ref(db, 'clients');
        const snapshot = await get(clientsRef);
        if (snapshot.exists()) {
          const clientsData = Object.entries(snapshot.val()).map(([id, data]: any) => ({
            id,
            ...data,
          }));
          setClients(clientsData.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch (error) {
        console.error('Error loading clients:', error);
      }
    };
    loadClients();
  }, []);

  // Load records when client selected
  React.useEffect(() => {
    if (!selectedClientId) {
      setRecords([]);
      setEntries([]);
      return;
    }

    const loadRecords = async () => {
      setLoading(true);
      try {
        const clientAccountId = `6000${selectedClientId}`;
        const allRecords: ClientRecord[] = [];

        // Get cash records
        const cashRef = ref(db, 'cash_records');
        const cashSnapshot = await get(cashRef);
        if (cashSnapshot.exists()) {
          Object.entries(cashSnapshot.val()).forEach(([id, record]: any) => {
            if (record.clientId === selectedClientId) {
              allRecords.push({
                id,
                type: 'cash',
                amount: record.amountusd || 0,
                clientId: record.clientId,
                status: record.status,
                date: record.date,
                recordType: record.type,
              });
            }
          });
        }

        // Get USDT records
        const usdtRef = ref(db, 'usdt_records');
        const usdtSnapshot = await get(usdtRef);
        if (usdtSnapshot.exists()) {
          Object.entries(usdtSnapshot.val()).forEach(([id, record]: any) => {
            if (record.clientId === selectedClientId) {
              allRecords.push({
                id,
                type: 'usdt',
                amount: record.amount || 0,
                clientId: record.clientId,
                status: record.status,
                date: record.date,
                recordType: record.type,
              });
            }
          });
        }

        allRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setRecords(allRecords);

        // Load all journal entries
        const journalRef = ref(db, 'journal_entries');
        const journalSnapshot = await get(journalRef);
        const allEntries: DetailedEntry[] = [];

        if (journalSnapshot.exists()) {
          Object.entries(journalSnapshot.val()).forEach(([journalId, entry]: any) => {
            if (entry.debit_account === clientAccountId || entry.credit_account === clientAccountId) {
              allEntries.push({
                journalId,
                date: entry.date,
                description: entry.description,
                debitAccount: entry.debit_account,
                creditAccount: entry.credit_account,
                amount: entry.amount_usd || 0,
                balanceBefore: entry.debit_account === clientAccountId 
                  ? entry.debit_account_balance_before 
                  : entry.credit_account_balance_before,
                balanceAfter: entry.debit_account === clientAccountId
                  ? entry.debit_account_balance_after
                  : entry.credit_account_balance_after,
              });
            }
          });
        }

        allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setEntries(allEntries);
      } catch (error) {
        console.error('Error loading records:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRecords();
  }, [selectedClientId]);

  const clientName = clients.find(c => c.id === selectedClientId)?.name || '';
  const finalBalance = entries.length > 0 ? entries[entries.length - 1].balanceAfter : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Client Balance Detail Report</CardTitle>
          <CardDescription>
            Shows all records for a client with journal entries and running balance before/after each transaction
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Client</label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm font-medium text-blue-900">
                  Current Balance: ${finalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-blue-700">
                  {entries.length} journal entries | {records.length} records
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </CardContent>
        </Card>
      )}

      {!loading && selectedClientId && entries.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">No journal entries found for this client.</p>
          </CardContent>
        </Card>
      )}

      {!loading && selectedClientId && entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Journal Entries for {clientName}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {entries.map((entry, index) => (
                <div key={entry.journalId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-mono">{new Date(entry.date).toLocaleDateString()}</div>
                      <div className="text-xs text-muted-foreground break-words">{entry.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">${entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-xs text-muted-foreground">Entry #{index + 1}</div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-2 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Balance Before:</span>
                      <span className="font-mono">${entry.balanceBefore.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${entry.balanceAfter > entry.balanceBefore ? 'text-blue-600' : 'text-red-600'}`}>
                      <span>Balance After:</span>
                      <span className="font-mono">${entry.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>DEBIT: {entry.debitAccount}</div>
                    <div>CREDIT: {entry.creditAccount}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
