
'use client';

import { useEffect, useState } from 'react';
import { fixAccount7000 } from '@/lib/actions/account';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function FixAccount7000Page() {
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<any>(null);

    useEffect(() => {
        const runFix = async () => {
            try {
                const res = await fixAccount7000();
                setResult(res);
            } catch (error) {
                setResult({ success: false, message: 'Error: ' + String(error) });
            } finally {
                setLoading(false);
            }
        };

        runFix();
    }, []);

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Fix Unmatched Accounts</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <div className="animate-spin">⏳</div>
                            <span>Fixing accounts 7001 & 7002...</span>
                        </div>
                    ) : result?.success ? (
                        <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-green-900">{result.message}</p>
                                <p className="text-sm text-green-800 mt-1">✅ Account 7001 (Unmatched Cash - USD)<br/>✅ Account 7002 (Unmatched USDT)<br/>Both are now posting accounts and will show balances on the dashboard.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold text-red-900">Fix Failed</p>
                                <p className="text-sm text-red-800 mt-1">{result?.message || 'Unknown error occurred'}</p>
                            </div>
                        </div>
                    )}

                    {!loading && (
                        <Button onClick={() => window.location.href = '/'} className="mt-4">
                            Return to Dashboard
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
