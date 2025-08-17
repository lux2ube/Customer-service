

import { redirect } from 'next/navigation';

export default function AddTransactionPage() {
    // Redirect to the main transactions list, as adding is now done via the modern form.
    redirect('/transactions');
}
