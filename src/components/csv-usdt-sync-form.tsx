'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { BscApiSetting } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue } from 'firebase/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface CsvRow {
    hash: string;
    blockNumber: string;
    timeStamp: string;
    from: string;
    to: string;
    amount: number;
}

export function CsvUsdtSyncForm() {
    const { toast } = useToast();
    const [apiSettings, setApiSettings] = React.useState<BscApiSetting[]>([]);
    const [selectedApi, setSelectedApi] = React.useState('');
    const [isProcessing, setIsProcessing] = React.useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        const settingsRef = ref(db, 'bsc_apis');
        const unsubscribe = onValue(settingsRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const list: BscApiSetting[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                setApiSettings(list);
                if (list.length > 0 && !selectedApi) {
                    setSelectedApi(list[0].id);
                }
            } else {
                setApiSettings([]);
            }
        });
        return () => unsubscribe();
    }, [selectedApi]);

    const parseCsv = (csvText: string): CsvRow[] => {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];

        const headers = lines[0].split(',').map((h: string) => h.replace(/^"|"$/g, '').trim());
        const headerMap: { [key: string]: number } = {};
        headers.forEach((header: string, index: number) => {
            headerMap[header.toLowerCase()] = index;
        });

        const rows: CsvRow[] = [];
        const processedHashes = new Set<string>();

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line
                .match(/"([^"]*)"|([^,]+)/g)
                ?.map((v: string) => v.replace(/^"|"$/g, '').trim()) || [];

            if (values.length < 6) continue;

            const hash = values[headerMap['transaction hash']]?.toLowerCase() || '';
            const blockNumber = values[headerMap['blockno']] || '0';
            const timeStamp = values[headerMap['unixtimestamp']] || '0';
            const from = values[headerMap['from']]?.toLowerCase() || '';
            const to = values[headerMap['to']]?.toLowerCase() || '';
            const tokenValue = values[headerMap['tokenvalue']]?.replace(/,/g, '') || '0';

            if (processedHashes.has(hash)) continue;
            if (!hash || !from || !to) continue;

            const amount = parseFloat(tokenValue);
            if (amount <= 0.01) continue;

            processedHashes.add(hash);
            rows.push({
                hash,
                blockNumber,
                timeStamp,
                from,
                to,
                amount,
            });
        }

        return rows;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedApi) return;

        setIsProcessing(true);
        try {
            const csvText = await file.text();
            const rows = parseCsv(csvText);

            if (rows.length === 0) {
                toast({
                    title: 'No Valid Rows',
                    description: 'CSV has no valid transactions (all filtered or invalid format)',
                    variant: 'destructive',
                });
                setIsProcessing(false);
                return;
            }

            // Send in batches of 10 rows
            const BATCH_SIZE = 10;
            let totalSynced = 0;
            let totalSkipped = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

                toast({
                    title: 'Processing',
                    description: `Batch ${batchNum}/${totalBatches}: Syncing ${batch.length} rows...`,
                });

                try {
                    const response = await fetch('/api/sync-usdt-csv', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ apiId: selectedApi, rows: batch }),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Batch sync failed');
                    }

                    totalSynced += data.synced;
                    totalSkipped += data.skipped;
                } catch (batchError: any) {
                    toast({
                        title: 'Batch Failed',
                        description: `Batch ${batchNum} error: ${batchError.message}`,
                        variant: 'destructive',
                    });
                    setIsProcessing(false);
                    return;
                }
            }

            // Success summary
            const summary = [
                `CSV sync completed.`,
                `${totalSynced} transaction(s) synced.`,
                totalSkipped > 0 ? `${totalSkipped} transaction(s) skipped.` : null,
            ]
                .filter(Boolean)
                .join(' ');

            toast({
                title: 'CSV Sync Complete',
                description: summary,
            });

            // Reset form
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to process CSV',
                variant: 'destructive',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    if (apiSettings.length === 0) {
        return (
            <Button variant="outline" disabled>
                <Upload className="mr-2 h-4 w-4" />
                No API Configured
            </Button>
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedApi} onValueChange={setSelectedApi}>
                <SelectTrigger className="w-full md:w-[250px]">
                    <SelectValue placeholder="Select API configuration..." />
                </SelectTrigger>
                <SelectContent>
                    {apiSettings.map(api => (
                        <SelectItem key={api.id} value={api.id}>
                            {api.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="w-full md:w-[200px]"
            />

            {isProcessing && (
                <Button disabled>
                    <Upload className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                </Button>
            )}
        </div>
    );
}
