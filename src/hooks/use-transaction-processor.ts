
'use client';

import * as React from 'react';
import type { UnifiedFinancialRecord, CryptoFee, Transaction } from '@/lib/types';

interface UseTransactionProcessorProps {
    selectedRecordIds: string[];
    records: UnifiedFinancialRecord[];
    cryptoFees: CryptoFee | null;
    transactionType: Transaction['type'] | null;
}

export function useTransactionProcessor({
    selectedRecordIds,
    records,
    cryptoFees,
    transactionType,
}: UseTransactionProcessorProps) {
    
    const calculation = React.useMemo(() => {
        const selected = records.filter(r => selectedRecordIds.includes(r.id));
        if (!cryptoFees) {
            return { totalInflowUSD: 0, totalOutflowUSD: 0, fee: 0, difference: 0 };
        }

        const totalInflowUSD = selected.filter(r => r.type === 'inflow').reduce((sum, r) => sum + (r.amount_usd || 0), 0);
        const totalOutflowUSD = selected.filter(r => r.type === 'outflow').reduce((sum, r) => sum + (r.amount_usd || 0), 0);
        
        let fee = 0;
        const selectedTransactionType = transactionType || 'Transfer'; // Default to transfer if not specified

        if (selectedTransactionType === 'Deposit') {
            const usdtOutflow = selected.filter(r => r.type === 'outflow' && r.category === 'crypto').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.buy_fee_percent || 0) / 100;
            fee = Math.max(usdtOutflow * feePercent, usdtOutflow > 0 ? (cryptoFees.minimum_buy_fee || 0) : 0);
        } else if (selectedTransactionType === 'Withdraw') {
            const usdtInflow = selected.filter(r => r.type === 'inflow' && r.category === 'crypto').reduce((sum, r) => sum + r.amount, 0);
            const feePercent = (cryptoFees.sell_fee_percent || 0) / 100;
            fee = Math.max(usdtInflow * feePercent, usdtInflow > 0 ? (cryptoFees.minimum_sell_fee || 0) : 0);
        } else if (selectedTransactionType === 'Transfer') {
            // For generic transfers, just sum inflows and outflows without a specific fee logic
            // The fee is assumed to be 0 unless a specific rule is applied.
            // A positive difference implies profit, negative implies loss.
        }

        // For generic calculation, difference is what client GIVES vs what client GETS
        // Inflow = Client Gives, Outflow = Client Gets
        const difference = totalInflowUSD - (totalOutflowUSD + fee);
        
        return { totalInflowUSD, totalOutflowUSD, fee, difference };
    }, [selectedRecordIds, records, cryptoFees, transactionType]);

    return { calculation };
}
