'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { BscApiSetting } from '@/lib/types';
import { db } from '@/lib/firebase';
import { ref, onValue, get, update } from 'firebase/database';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

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

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedApi) {
            toast({
                title: 'Error',
                description: 'Please select a file and API configuration',
                variant: 'destructive',
            });
            return;
        }

        setIsProcessing(true);

        try {
            const csvText = await file.text();
            const lines = csvText.trim().split('\n');

            if (lines.length < 2) {
                toast({
                    title: 'Error',
                    description: 'CSV file is empty',
                    variant: 'destructive',
                });
                setIsProcessing(false);
                return;
            }

            // Parse CSV headers
            const headers = lines[0].split(',').map((h: string) => h.replace(/^"|"$/g, '').trim());
            const headerMap: { [key: string]: number } = {};
            headers.forEach((header: string, index: number) => {
                headerMap[header.toLowerCase()] = index;
            });

            // Parse and validate rows
            const rows: any[] = [];
            const processedHashes = new Set<string>();

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const values = line.match(/"([^"]*)"|([^,]+)/g)?.map((v: string) => v.replace(/^"|"$/g, '').trim()) || [];

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

            if (rows.length === 0) {
                toast({
                    title: 'No Valid Rows',
                    description: 'CSV has no valid transactions',
                    variant: 'destructive',
                });
                setIsProcessing(false);
                return;
            }

            // Get API config
            const apiRef = ref(db, `bsc_apis/${selectedApi}`);
            const apiSnapshot = await get(apiRef);
            
            if (!apiSnapshot.exists()) {
                throw new Error('API Configuration not found');
            }

            const setting = apiSnapshot.val();
            const { walletAddress, accountId, name: configName } = setting;

            if (!walletAddress || !accountId) {
                throw new Error('Missing wallet address or account ID');
            }

            // Get wallet account name
            const accountRef = ref(db, `accounts/${accountId}`);
            const accountSnapshot = await get(accountRef);
            const cryptoWalletName = accountSnapshot.exists()
                ? accountSnapshot.val().name
                : 'Synced USDT Wallet';

            // Process in batches of 10
            const BATCH_SIZE = 10;
            let totalSynced = 0;
            let totalSkipped = 0;

            for (let i = 0; i < rows.length; i += BATCH_SIZE) {
                const batch = rows.slice(i, i + BATCH_SIZE);
                const batchNum = Math.floor(i / BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

                toast({
                    title: 'Processing',
                    description: `Batch ${batchNum}/${totalBatches}...`,
                });

                // Get current counter
                const counterRef = ref(db, 'counters/modernUsdtRecordId');
                const counterSnapshot = await get(counterRef);
                let sequenceCounter = counterSnapshot.exists() ? counterSnapshot.val() || 0 : 0;

                const updates: { [key: string]: any } = {};
                let batchSynced = 0;
                let batchSkipped = 0;

                // Process batch rows
                for (const row of batch) {
                    try {
                        const { hash, blockNumber, timeStamp, from, to, amount } = row;

                        if (!hash || !from || !to || !timeStamp || amount === undefined) {
                            batchSkipped++;
                            continue;
                        }

                        const syncedAmount = parseFloat(String(amount));
                        if (syncedAmount <= 0.01) {
                            batchSkipped++;
                            continue;
                        }

                        const isIncoming = String(to).toLowerCase() === String(walletAddress).toLowerCase();
                        const clientWalletAddress = isIncoming ? String(from) : String(to);

                        sequenceCounter++;
                        const newRecordId = `USDT${sequenceCounter}`;
                        const dateISO = new Date(parseInt(String(timeStamp)) * 1000).toISOString();

                        const newTxData = {
                            id: newRecordId,
                            date: dateISO,
                            type: isIncoming ? 'inflow' : 'outflow',
                            source: 'CSV',
                            status: 'Confirmed',
                            clientId: null,
                            clientName: 'Unassigned',
                            accountId: accountId,
                            accountName: cryptoWalletName,
                            amount: syncedAmount,
                            clientWalletAddress: clientWalletAddress,
                            txHash: String(hash),
                            notes: `Synced from CSV: ${configName}`,
                            createdAt: new Date().toISOString(),
                        };

                        updates[`/modern_usdt_records/${newRecordId}`] = newTxData;
                        batchSynced++;
                    } catch (rowError) {
                        batchSkipped++;
                    }
                }

                // Write batch to database
                if (Object.keys(updates).length > 0) {
                    updates['/counters/modernUsdtRecordId'] = sequenceCounter;
                    await update(ref(db), updates);
                }

                totalSynced += batchSynced;
                totalSkipped += batchSkipped;
            }

            // Success
            toast({
                title: 'CSV Sync Complete',
                description: `${totalSynced} synced, ${totalSkipped} skipped`,
            });

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
        <div className="space-y-4">
            <div className="flex gap-2 items-end">
                <Select value={selectedApi} onValueChange={setSelectedApi}>
                    <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select API configuration" />
                    </SelectTrigger>
                    <SelectContent>
                        {apiSettings.map((setting) => (
                            <SelectItem key={setting.id} value={setting.id}>
                                {setting.name}
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
                    className="max-w-sm"
                />
                
                <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                    <Upload className="mr-2 h-4 w-4" />
                    {isProcessing ? 'Processing...' : 'Upload CSV'}
                </Button>
            </div>
        </div>
    );
}
