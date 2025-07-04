import { PageHeader } from "@/components/page-header";
import { TransactionForm } from "@/components/transaction-form";
import { db } from "@/lib/firebase";
import type { Client, BankAccount, CryptoWallet } from "@/lib/types";
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

async function getBankAccounts(): Promise<BankAccount[]> {
    const accountsRef = ref(db, 'bank_accounts/');
    const snapshot = await get(accountsRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return Object.keys(data).map(key => ({
            id: key,
            ...data[key]
        }));
    }
    return [];
}

async function getCryptoWallets(): Promise<CryptoWallet[]> {
    return [
        { id: 'w1', name: 'Main Binance Wallet', address: '0x123...abc' },
        { id: 'w2', name: 'Hot Wallet', address: '0x456...def' },
    ]
}


export default async function NewTransactionPage() {
    const clients = await getClients();
    const bankAccounts = await getBankAccounts();
    const cryptoWallets = await getCryptoWallets();

    return (
        <>
            <PageHeader
                title="Add New Transaction"
                description="Fill in the details for a manual transaction."
            />
            <div className="space-y-6">
                <TransactionForm clients={clients} bankAccounts={bankAccounts} cryptoWallets={cryptoWallets} />
            </div>
        </>
    );
}
