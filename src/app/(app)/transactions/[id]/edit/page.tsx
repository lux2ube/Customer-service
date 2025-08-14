
import { redirect } from 'next/navigation';

export default function EditTransactionPage({ params }: { params: { id: string } }) {
    // Redirect to the main transactions list. Editing happens through the ledger records now.
    redirect('/transactions');
}
