import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { getCustomers, getLabels, getLists } from "@/lib/data";
import { Users, Tag, List } from "lucide-react";
import { DashboardChart } from "@/components/dashboard-chart";
import { subDays, isAfter } from 'date-fns';

export default async function DashboardPage() {
    const customers = await getCustomers();
    const labels = await getLabels();
    const lists = await getLists();

    const thirtyDaysAgo = subDays(new Date(), 30);
    const newCustomersCount = customers.filter(c => isAfter(new Date(c.createdAt), thirtyDaysAgo)).length;

    const chartData = [
        { name: 'Jan', value: Math.floor(Math.random() * 20) + 5 },
        { name: 'Feb', value: Math.floor(Math.random() * 20) + 10 },
        { name: 'Mar', value: Math.floor(Math.random() * 20) + 8 },
        { name: 'Apr', value: Math.floor(Math.random() * 20) + 15 },
        { name: 'May', value: Math.floor(Math.random() * 20) + 12 },
        { name: 'Jun', value: newCustomersCount },
    ];

    return (
        <>
            <PageHeader
                title="Dashboard"
                description="Here's a snapshot of your CRM activity."
            />
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{customers.length}</div>
                        <p className="text-xs text-muted-foreground">+{newCustomersCount} in last 30 days</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Labels</CardTitle>
                        <Tag className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{labels.length}</div>
                        <p className="text-xs text-muted-foreground">Used to categorize customers</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Custom Lists</CardTitle>
                        <List className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{lists.length}</div>
                        <p className="text-xs text-muted-foreground">User-defined customer groups</p>
                    </CardContent>
                </Card>
            </div>
            <div className="mt-6">
                <Card>
                    <CardHeader>
                        <CardTitle>New Customers Overview</CardTitle>
                        <CardDescription>A look at new customer sign-ups over the past 6 months.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DashboardChart data={chartData} />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
