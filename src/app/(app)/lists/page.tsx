import { PageHeader } from "@/components/page-header";
import { getLists, getCustomers } from "@/lib/data";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import Link from 'next/link';

export default async function ListsPage() {
    const lists = await getLists();
    const customers = await getCustomers();
    const customerMap = new Map(customers.map(c => [c.id, c]));

    return (
        <>
            <PageHeader 
                title="Custom Lists"
                description="Manage your saved lists of customers."
            >
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create New List
                </Button>
            </PageHeader>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {lists.map(list => (
                    <Card key={list.id}>
                        <CardHeader>
                            <CardTitle>{list.name}</CardTitle>
                            <CardDescription>{list.customerIds.length} members</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <h4 className="text-sm font-medium">Members:</h4>
                                <ul className="text-sm text-muted-foreground list-disc pl-5">
                                    {list.customerIds.slice(0, 5).map(id => (
                                        <li key={id} className="truncate">
                                            <Link href={`/customers/${id}`} className="hover:underline">
                                                {customerMap.get(id)?.name || 'Unknown Customer'}
                                            </Link>
                                        </li>
                                    ))}
                                    {list.customerIds.length > 5 && (
                                        <li>...and {list.customerIds.length - 5} more.</li>
                                    )}
                                </ul>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                 {lists.length === 0 && (
                    <div className="col-span-full text-center py-10">
                        <p className="text-muted-foreground">You haven't created any custom lists yet.</p>
                    </div>
                )}
            </div>
        </>
    );
}
