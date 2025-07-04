import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { db } from "@/lib/firebase";
import { Client } from "@/lib/types";
import { get, ref } from "firebase/database";


async function getClients(): Promise<Client[]> {
    const usersRef = ref(db, 'users/');
    const snapshot = await get(usersRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        }));
    }
    return [];
}


export default async function NewTransactionPage() {
    const clients = await getClients();

    return (
        <>
            <PageHeader
                title="Add New Transaction"
                description="Fill in the details to create a new transaction."
            />
            <div className="space-y-6">
                <TransactionForm clients={clients} />
            </div>
        </>
    );
}
