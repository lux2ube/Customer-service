
import { redirect } from 'next/navigation';

export default function EditCashPaymentPage({ params }: { params: { id: string } }) {
    redirect(`/cash-records/${params.id}/edit`);
}
