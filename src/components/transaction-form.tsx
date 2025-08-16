
'use client';

// This component is deprecated and should not be used.
// It is kept temporarily to avoid breaking imports but will be removed.
// The modern transaction workflow is handled by modern-transaction-form.tsx

import { redirect } from 'next/navigation';
import { useEffect } from 'react';

export function TransactionForm() {
    useEffect(() => {
        redirect('/transactions/modern');
    }, []);
    return null;
}
