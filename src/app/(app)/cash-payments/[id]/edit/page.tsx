
import { redirect } from 'next/navigation';

export default function EditCashPaymentPage({ params }: { params: { id: string } }) {
    redirect(`/modern-cash-records/${params.id}/edit`);
}
